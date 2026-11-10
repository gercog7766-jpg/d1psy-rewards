-- Owner delegation uses the same atomic round/budget engine as the streamer dashboard.
create function public.rewards_streamer_live_manage(p_actor text,p_broadcaster text,p_action text,p_body jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.rewards_streamers where is_primary and twitch_broadcaster_id=p_actor) then raise exception 'owner_required';end if;
 if p_action is null or p_action not in('state','start','stop') or jsonb_typeof(p_body) is distinct from 'object' then raise exception 'invalid_request';end if;
 if not exists(select 1 from public.rewards_streamer_live_profiles where broadcaster_id=p_broadcaster and status='approved') then raise exception 'approval_required';end if;
 if exists(select 1 from public.rewards_streamers where is_primary and twitch_broadcaster_id=p_broadcaster) then raise exception 'invalid_request';end if;
 result:=public.rewards_streamer_live_api(p_broadcaster,p_action,p_body);
 if p_action in('start','stop') then
  insert into public.rewards_streamer_live_audit(actor,action,target) values(p_actor,'remote:'||p_action,p_broadcaster);
  if p_action='start' then update public.rewards_streamer_live_ledger set actor=p_actor where broadcaster_id=p_broadcaster and request_id=(p_body->>'requestId')::uuid and kind='reserve';end if;
 end if;
 return result;
end $$;
revoke all on function public.rewards_streamer_live_manage(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_streamer_live_manage(text,text,text,jsonb) to service_role;
