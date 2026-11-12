create unique index rewards_vault_prepare_next_nonce
 on public.rewards_vault_audit((details->>'requestId')) where action='prepare_next';

create function public.rewards_vault_prepare_next(p_actor text,p_body jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 target_week date;
 required integer;
 request_id text;
 prior public.rewards_vault_audit%rowtype;
 start_time timestamptz;
begin
 if not exists(select 1 from public.rewards_admins where twitch_user_id=p_actor) then raise exception 'admin_required'; end if;
 target_week:=(p_body->>'week')::date;
 required:=(p_body->>'requiredKeys')::integer;
 request_id:=p_body->>'requestId';
 if target_week is null or required is null or required not between 5 and 1000000
    or request_id is null or request_id !~ '^[a-f0-9-]{36}$'
 then raise exception 'invalid_request'; end if;

 perform pg_advisory_xact_lock(7268021,1);
 select * into prior from public.rewards_vault_audit
 where action='prepare_next' and details->>'requestId'=request_id;
 if found then
  if prior.actor<>p_actor or prior.details<>p_body then raise exception 'request_conflict'; end if;
  return jsonb_build_object('ok',true);
 end if;
 select starts_at into start_time from public.rewards_vault_seasons where week=target_week;
 if public.rewards_vault_now()>=coalesce(start_time,target_week::timestamp at time zone 'Europe/Moscow')
 then raise exception 'season_locked'; end if;

 -- The existing reserve and threshold writes share this transaction and lock.
 perform public.rewards_vault_admin(p_actor,'prepare',p_body-'requiredKeys');
 perform public.rewards_vault_admin(p_actor,'threshold',jsonb_build_object(
  'week',target_week,'requiredKeys',required,'requestId',request_id));
 insert into public.rewards_vault_audit(actor,action,week,details)
 values(p_actor,'prepare_next',target_week,p_body);
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.rewards_vault_prepare_next(text,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_vault_prepare_next(text,jsonb) to service_role;
