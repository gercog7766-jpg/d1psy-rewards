-- Temporary subscription equipment is independent of permanent purchased styles.
create table public.rewards_stars_profile_equipment(
 user_id uuid primary key references public.rewards_users(id) on delete cascade,
 frame text check(frame in('lite_frame','plus_frame')),
 background text check(background in('lite_background','plus_background')),
 badge text check(badge in('lite_badge','plus_badge')),
 title text check(title in('lite_title','plus_title')),
 updated_at timestamptz not null default now()
);
alter table public.rewards_stars_profile_equipment enable row level security;
revoke all on public.rewards_stars_profile_equipment from public,anon,authenticated;
grant select,insert,update on public.rewards_stars_profile_equipment to service_role;

create function public.rewards_stars_cosmetic_allowed(p_tier text,p_slot text,p_item text) returns boolean
language sql immutable security invoker set search_path='' as $$
 select p_item is null or (p_slot in('frame','background','badge','title') and ((p_tier in('lite','plus') and p_item='lite_'||p_slot) or (p_tier='plus' and p_item='plus_'||p_slot)));
$$;
revoke all on function public.rewards_stars_cosmetic_allowed(text,text,text) from public,anon,authenticated;
grant execute on function public.rewards_stars_cosmetic_allowed(text,text,text) to service_role;

create function public.rewards_stars_profile_style(p_actor text,p_action text,p_body jsonb default '{}'::jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare me uuid; tier text; e public.rewards_stars_profile_equipment; slot text;
begin
 select u.id into me from public.rewards_users u join public.rewards_admins a on a.twitch_user_id=u.twitch_user_id where u.twitch_user_id=p_actor and not coalesce(u.banned,false) for update of u;
 if me is null then raise exception 'admin_required';end if;
 tier:=public.rewards_stars_gift_tier(me);
 if p_action='save' then
  if jsonb_typeof(p_body) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_body))<>4 then raise exception 'invalid_request';end if;
  foreach slot in array array['frame','background','badge','title'] loop
   if not (p_body?slot) or jsonb_typeof(p_body->slot) not in('string','null') then raise exception 'invalid_request';end if;
   if not coalesce(public.rewards_stars_cosmetic_allowed(tier,slot,p_body->>slot),false) then raise exception 'cosmetic_not_owned';end if;
  end loop;
  insert into public.rewards_stars_profile_equipment(user_id,frame,background,badge,title) values(me,p_body->>'frame',p_body->>'background',p_body->>'badge',p_body->>'title') on conflict(user_id) do update set frame=excluded.frame,background=excluded.background,badge=excluded.badge,title=excluded.title,updated_at=now();
 elsif p_action<>'state' then raise exception 'invalid_request';end if;
 select * into e from public.rewards_stars_profile_equipment where user_id=me;
 return jsonb_build_object('tier',tier,'equipment',jsonb_build_object('frame',case when public.rewards_stars_cosmetic_allowed(tier,'frame',e.frame) then e.frame end,'background',case when public.rewards_stars_cosmetic_allowed(tier,'background',e.background) then e.background end,'badge',case when public.rewards_stars_cosmetic_allowed(tier,'badge',e.badge) then e.badge end,'title',case when public.rewards_stars_cosmetic_allowed(tier,'title',e.title) then e.title end));
end $$;
revoke all on function public.rewards_stars_profile_style(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_stars_profile_style(text,text,jsonb) to service_role;

-- During the closed pilot, even public-profile cosmetics are visible only to administrators.
create function public.rewards_stars_profile_styles(p_viewer text,p_logins text[]) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if coalesce(cardinality(p_logins),0)>24 or not exists(select 1 from public.rewards_users u join public.rewards_admins a on a.twitch_user_id=u.twitch_user_id where u.twitch_user_id=p_viewer and not coalesce(u.banned,false)) then return '[]'::jsonb;end if;
 select coalesce(jsonb_agg(jsonb_build_object('login',x.login,'equipment',x.equipment)),'[]'::jsonb) into result from (
  select u.twitch_login login,jsonb_strip_nulls(jsonb_build_object('frame',case when public.rewards_stars_cosmetic_allowed(t.tier,'frame',e.frame) then e.frame end,'background',case when public.rewards_stars_cosmetic_allowed(t.tier,'background',e.background) then e.background end,'badge',case when public.rewards_stars_cosmetic_allowed(t.tier,'badge',e.badge) then e.badge end,'title',case when public.rewards_stars_cosmetic_allowed(t.tier,'title',e.title) then e.title end)) equipment
  from public.rewards_stars_profile_equipment e join public.rewards_users u on u.id=e.user_id cross join lateral (select public.rewards_stars_gift_tier(u.id) tier) t where u.twitch_login=any(p_logins) and not coalesce(u.banned,false) and t.tier<>'free'
 ) x where x.equipment<>'{}'::jsonb;
 return result;
end $$;
revoke all on function public.rewards_stars_profile_styles(text,text[]) from public,anon,authenticated;
grant execute on function public.rewards_stars_profile_styles(text,text[]) to service_role;
notify pgrst,'reload schema';
