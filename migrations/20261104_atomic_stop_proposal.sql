-- PROPOSAL ONLY. Test with the start RPC in an isolated database.
create or replace function public.rewards_streamer_stop_round(p_streamer_id uuid)
returns integer language plpgsql security invoker set search_path = ''
as $$
declare v_count integer;
begin
  perform 1 from public.rewards_streamer_settings
    where streamer_id = p_streamer_id for update;
  if not found then raise exception 'settings_missing'; end if;
  if not exists (select 1 from public.rewards_streamers
    where id = p_streamer_id and enabled and not is_primary) then
    raise exception 'streamer_not_enabled';
  end if;
  update public.rewards_streamer_settings
    set enabled = false, updated_at = now()
    where streamer_id = p_streamer_id;
  update public.rewards_rounds
    set status = 'cancelled', ended_at = now(), completion_reason = 'manual_stop'
    where streamer_id = p_streamer_id and status = 'active';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.rewards_streamer_stop_round(uuid) from public, anon, authenticated;
grant execute on function public.rewards_streamer_stop_round(uuid) to service_role;
