-- Identify actual, already-applied donations; never create another hit or change HP.
create function public.rewards_boss_identify_donation(p_actor text,p_source text,p_login text,p_rub numeric,p_hit_id uuid default null) returns jsonb
language plpgsql set search_path='' as $$
declare target uuid; v_hit record; candidates jsonb; total int;
begin
 if not exists(select 1 from public.rewards_streamers where is_primary and enabled and twitch_broadcaster_id=p_actor) then raise exception 'owner_required';end if;
 if p_source is null or p_source not in ('donationalerts','ihaq') or p_login is null or p_login !~ '^[A-Za-z0-9_]{1,25}$' or p_rub is null or p_rub<0.5 or p_rub>10000000 or round(p_rub,2)<>p_rub then raise exception 'invalid_request';end if;
 perform pg_advisory_xact_lock(78104921);
 select id into target from public.rewards_users where lower(twitch_login)=lower(p_login) and not coalesce(banned,false) and not coalesce(participation_restricted,false);
 if target is null then raise exception 'unknown_user';end if;
 if p_hit_id is null then
  select count(*)::int,coalesce(jsonb_agg(jsonb_build_object('id',q.id,'donor',q.donor,'at',q.created_at,'damage',q.damage,'kind',q.kind,'linked',q.user_id is not null,'sameTarget',q.user_id=target) order by q.created_at desc),'[]'::jsonb) into total,candidates
  from (select h.id,h.donor,h.created_at,h.damage,h.user_id,b.kind from public.rewards_boss_hits h join public.rewards_boss_runs b on b.id=h.run_id where b.status in ('active','paused','review','parked') and h.source=p_source and h.amount_rub=p_rub and not h.rejected order by h.created_at desc limit 100) q;
  if total=0 then raise exception 'donation_not_found';end if;
  return jsonb_build_object('candidates',candidates);
 end if;
 select h.* into v_hit from public.rewards_boss_hits h join public.rewards_boss_runs b on b.id=h.run_id where h.id=p_hit_id and b.status in ('active','paused','review','parked') and h.source=p_source and h.amount_rub=p_rub and not h.rejected for update of h;
 if not found then raise exception 'donation_not_found';end if;
 if v_hit.user_id is not null and v_hit.user_id<>target then raise exception 'already_identified';end if;
 if v_hit.user_id=target then return jsonb_build_object('ok',true,'damage',v_hit.damage,'already',true);end if;
 update public.rewards_boss_hits set user_id=target,confirmed=true where id=p_hit_id;
 return jsonb_build_object('ok',true,'damage',v_hit.damage,'already',false);
end$$;
revoke all on function public.rewards_boss_identify_donation(text,text,text,numeric,uuid) from public,anon,authenticated;
grant execute on function public.rewards_boss_identify_donation(text,text,text,numeric,uuid) to service_role;
notify pgrst,'reload schema';
