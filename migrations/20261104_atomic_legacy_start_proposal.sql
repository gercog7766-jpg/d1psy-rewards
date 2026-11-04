-- PROPOSAL ONLY: transactional legacy round start for streamer_id IS NULL.
-- Apply only after full-schema integration tests. Never run against live DB yet.
create or replace function public.rewards_legacy_start_round(
  p_mode text default null,
  p_interval_seconds integer default null,
  p_message_threshold integer default null
) returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
  v_settings public.rewards_settings%rowtype;
  v_prize uuid;
  v_round uuid;
  v_mode text;
  v_interval integer;
  v_threshold integer;
begin
  select * into v_settings from public.rewards_settings where id=true for update;
  if not found then raise exception 'legacy_settings_missing'; end if;
  if v_settings.twitch_connection_status <> 'connected' then
    raise exception 'twitch_not_connected';
  end if;
  if exists (select 1 from public.rewards_rounds
    where streamer_id is null and status='active') then
    raise exception 'round_already_active';
  end if;
  v_mode := coalesce(p_mode,v_settings.mode);
  v_interval := coalesce(p_interval_seconds,v_settings.interval_seconds);
  v_threshold := coalesce(p_message_threshold,v_settings.message_threshold);
  if v_mode not in ('time','messages') or v_interval not between 60 and 900
     or v_threshold not between 50 and 200 then
    raise exception 'invalid_round_settings';
  end if;
  select p.id into v_prize from public.rewards_prizes p
    where p.status='available'
    and not exists (select 1 from public.rewards_rounds r
      where r.prize_id=p.id and r.status='active')
    order by random() limit 1 for update of p skip locked;
  if v_prize is null then raise exception 'no_available_prizes'; end if;
  insert into public.rewards_rounds
    (mode,interval_seconds,message_threshold,status,prize_id)
  values (v_mode,v_interval,v_threshold,'active',v_prize)
  returning id into v_round;
  update public.rewards_settings
    set enabled=true,mode=v_mode,interval_seconds=v_interval,
        message_threshold=v_threshold,selected_prize_id=v_prize,updated_at=now()
    where id=true;
  return v_round;
end;
$$;
revoke all on function public.rewards_legacy_start_round(text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.rewards_legacy_start_round(text,integer,integer)
  to service_role;
