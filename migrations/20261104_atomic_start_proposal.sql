-- PROPOSAL ONLY. Must be reviewed and tested in an isolated DB.
-- Called by the server using its service-role key, never by the browser.
create or replace function public.rewards_streamer_start_round(p_streamer_id uuid)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
  v public.rewards_streamer_settings%rowtype;
  v_prize uuid;
  v_round uuid;
begin
  select * into v from public.rewards_streamer_settings
    where streamer_id = p_streamer_id for update;
  if not found then raise exception 'settings_missing'; end if;
  if not exists (select 1 from public.rewards_streamers
    where id = p_streamer_id and enabled and not is_primary) then
    raise exception 'streamer_not_enabled';
  end if;
  if v.twitch_connection_status <> 'connected' then
    raise exception 'twitch_not_connected';
  end if;
  if exists (select 1 from public.rewards_rounds
    where streamer_id = p_streamer_id and status = 'active') then
    raise exception 'round_already_active';
  end if;

  select p.id into v_prize from public.rewards_prizes p
    where p.status = 'available'
    and not exists (select 1 from public.rewards_rounds r
      where r.prize_id = p.id and r.status = 'active')
    order by random() limit 1 for update of p skip locked;
  if v_prize is null then raise exception 'no_available_prizes'; end if;

  insert into public.rewards_rounds
    (streamer_id,mode,interval_seconds,message_threshold,status,prize_id)
  values (p_streamer_id,v.mode,v.interval_seconds,v.message_threshold,'active',v_prize)
  returning id into v_round;
  update public.rewards_streamer_settings
    set enabled = true, selected_prize_id = v_prize, updated_at = now()
    where streamer_id = p_streamer_id;
  return v_round;
end;
$$;
revoke all on function public.rewards_streamer_start_round(uuid) from public, anon, authenticated;
grant execute on function public.rewards_streamer_start_round(uuid) to service_role;
