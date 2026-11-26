-- Earned S2 cosmetics use real reward receipts, not simulated progress or subscription equipment.
alter table public.rewards_s2_live_claims add column cosmetic_id uuid not null default gen_random_uuid();
alter table public.rewards_s2_live_claims add constraint rewards_s2_claim_cosmetic_id_key unique(cosmetic_id);
create table public.rewards_s2_profile_equipment(
 user_id uuid primary key references public.rewards_users(id) on delete cascade,
 frame uuid references public.rewards_s2_live_claims(cosmetic_id),background uuid references public.rewards_s2_live_claims(cosmetic_id),badge uuid references public.rewards_s2_live_claims(cosmetic_id),title uuid references public.rewards_s2_live_claims(cosmetic_id),
 updated_at timestamptz not null default now()
);
alter table public.rewards_s2_profile_equipment enable row level security;
revoke all on public.rewards_s2_profile_equipment from public,anon,authenticated;
grant select,insert,update on public.rewards_s2_profile_equipment to service_role;

-- Season expiry is deliberately irrelevant: a valid claimed cosmetic is permanent.
-- Refunded Premium orders no longer authorize premium cosmetics.
create function public.rewards_s2_owned_cosmetics(p_user uuid) returns table(id uuid,kind text,label text,track text,level int,season text)
language sql stable security invoker set search_path='' as $$
 select c.cosmetic_id,c.kind,c.label,c.track,c.level,c.season from public.rewards_s2_live_claims c join public.rewards_users u on u.id=c.user_id
 where c.user_id=p_user and not coalesce(u.banned,false) and c.kind in('frame','background','badge','title') and (c.track='free' or (c.track='premium' and exists(select 1 from public.rewards_stars_pilot_orders o join public.rewards_stars_seasons s on s.season=o.season where o.actor=u.twitch_user_id and o.product='battlePass' and o.season=c.season and o.state='paid' and o.season_ends_at=s.ends_at and o.approved_at>=s.starts_at and o.approved_at<s.ends_at)))
$$;
revoke all on function public.rewards_s2_owned_cosmetics(uuid) from public,anon,authenticated;
grant execute on function public.rewards_s2_owned_cosmetics(uuid) to service_role;

create function public.rewards_s2_effective_equipment(p_user uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_object_agg(o.kind,to_jsonb(o)),'{}'::jsonb) from public.rewards_s2_profile_equipment e cross join lateral public.rewards_s2_owned_cosmetics(e.user_id) o
 where e.user_id=p_user and ((o.kind='frame' and o.id=e.frame) or (o.kind='background' and o.id=e.background) or (o.kind='badge' and o.id=e.badge) or (o.kind='title' and o.id=e.title));
$$;
revoke all on function public.rewards_s2_effective_equipment(uuid) from public,anon,authenticated;
grant execute on function public.rewards_s2_effective_equipment(uuid) to service_role;

create function public.rewards_s2_profile_style(p_actor text,p_action text,p_body jsonb default '{}'::jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare me uuid; slot text; chosen uuid; options jsonb;
begin
 select u.id into me from public.rewards_users u join public.rewards_admins a on a.twitch_user_id=u.twitch_user_id where u.twitch_user_id=p_actor and not coalesce(u.banned,false) for update of u;
 if me is null then raise exception 'admin_required';end if;
 if p_action='save' then
  if jsonb_typeof(p_body) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_body))<>4 then raise exception 'invalid_request';end if;
  foreach slot in array array['frame','background','badge','title'] loop
   if not (p_body?slot) or jsonb_typeof(p_body->slot) not in('string','null') then raise exception 'invalid_request';end if;
   chosen:=(p_body->>slot)::uuid;
   if chosen is not null and not exists(select 1 from public.rewards_s2_owned_cosmetics(me) o where o.id=chosen and o.kind=slot) then raise exception 'cosmetic_not_owned';end if;
  end loop;
  insert into public.rewards_s2_profile_equipment(user_id,frame,background,badge,title) values(me,(p_body->>'frame')::uuid,(p_body->>'background')::uuid,(p_body->>'badge')::uuid,(p_body->>'title')::uuid) on conflict(user_id) do update set frame=excluded.frame,background=excluded.background,badge=excluded.badge,title=excluded.title,updated_at=now();
 elsif p_action<>'state' then raise exception 'invalid_request';end if;
 select coalesce(jsonb_agg(to_jsonb(o) order by o.season,o.level,o.track),'[]'::jsonb) into options from public.rewards_s2_owned_cosmetics(me) o;
 return jsonb_build_object('options',options,'equipment',public.rewards_s2_effective_equipment(me));
end $$;
revoke all on function public.rewards_s2_profile_style(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_s2_profile_style(text,text,jsonb) to service_role;

create function public.rewards_s2_profile_styles(p_viewer text,p_logins text[]) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if coalesce(cardinality(p_logins),0)>24 or not exists(select 1 from public.rewards_users u join public.rewards_admins a on a.twitch_user_id=u.twitch_user_id where u.twitch_user_id=p_viewer and not coalesce(u.banned,false)) then return '[]'::jsonb;end if;
 select coalesce(jsonb_agg(jsonb_build_object('login',x.login,'equipment',x.equipment)),'[]'::jsonb) into result from (select u.twitch_login login,public.rewards_s2_effective_equipment(u.id) equipment from public.rewards_users u join public.rewards_s2_profile_equipment e on e.user_id=u.id where u.twitch_login=any(p_logins) and not coalesce(u.banned,false)) x where x.equipment<>'{}'::jsonb;
 return result;
end $$;
revoke all on function public.rewards_s2_profile_styles(text,text[]) from public,anon,authenticated;
grant execute on function public.rewards_s2_profile_styles(text,text[]) to service_role;
notify pgrst,'reload schema';
