-- Multi-stream phase 1 schema, prepared from the current production schema/RPC definitions.
-- IMPORTANT: this file is NOT applied automatically. Keep MULTISTREAM_DB_ENABLED=false
-- until this migration has been explicitly approved and applied.
-- User identity/balances, shop, upgrader, promo and OBS tables are intentionally untouched.

create table if not exists public.rewards_streamers (
  id uuid primary key default gen_random_uuid(),
  twitch_broadcaster_id text not null unique,
  twitch_login text not null unique,
  display_name text,
  enabled boolean not null default false,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rewards_streamers_one_primary_idx
  on public.rewards_streamers ((is_primary)) where is_primary;

create table if not exists public.rewards_streamer_settings (
  streamer_id uuid primary key references public.rewards_streamers(id) on delete cascade,
  enabled boolean not null default false,
  mode text not null default 'time' check (mode in ('time','messages')),
  interval_seconds integer not null default 300 check (interval_seconds between 60 and 900),
  message_threshold integer not null default 100 check (message_threshold between 50 and 200),
  selected_prize_id uuid null references public.rewards_prizes(id),
  twitch_connection_status text not null default 'disconnected' check (twitch_connection_status in ('connected','disconnected','reconnecting','error')),
  updated_at timestamptz not null default now()
);

alter table public.rewards_streamers enable row level security;
alter table public.rewards_streamer_settings enable row level security;
revoke all on table public.rewards_streamers from anon, authenticated;
revoke all on table public.rewards_streamer_settings from anon, authenticated;
grant select, insert, update, delete on table public.rewards_streamers to service_role;
grant select, insert, update, delete on table public.rewards_streamer_settings to service_role;

alter table public.rewards_rounds
  add column if not exists streamer_id uuid null references public.rewards_streamers(id);
alter table public.rewards_chat_events
  add column if not exists streamer_id uuid null references public.rewards_streamers(id);

create index if not exists rewards_rounds_streamer_status_idx on public.rewards_rounds(streamer_id,status);
create index if not exists rewards_chat_events_streamer_idx on public.rewards_chat_events(streamer_id,occurred_at desc);

drop index if exists public.rewards_one_active_round_idx;
create unique index if not exists rewards_rounds_one_active_legacy_idx
  on public.rewards_rounds ((1)) where status='active' and streamer_id is null;
create unique index if not exists rewards_rounds_one_active_per_streamer_idx
  on public.rewards_rounds(streamer_id) where status='active' and streamer_id is not null;

-- Verified from the existing rewards_users Twitch identity on 2026-11-03.
insert into public.rewards_streamers(twitch_broadcaster_id,twitch_login,display_name,enabled,is_primary)
values ('511100980','d1psy_off','d1psy_off',true,true)
on conflict (twitch_broadcaster_id) do update set
  twitch_login=excluded.twitch_login,
  display_name=excluded.display_name,
  enabled=true,
  is_primary=true,
  updated_at=now();

-- Seed primary streamer settings from the legacy singleton so cutover preserves behavior.
insert into public.rewards_streamer_settings(
  streamer_id,enabled,mode,interval_seconds,message_threshold,selected_prize_id,twitch_connection_status,updated_at
)
select st.id,s.enabled,s.mode,s.interval_seconds,s.message_threshold,s.selected_prize_id,s.twitch_connection_status,now()
from public.rewards_streamers st cross join public.rewards_settings s
where st.twitch_broadcaster_id='511100980' and s.id=true
on conflict (streamer_id) do update set
  enabled=excluded.enabled,
  mode=excluded.mode,
  interval_seconds=excluded.interval_seconds,
  message_threshold=excluded.message_threshold,
  selected_prize_id=excluded.selected_prize_id,
  twitch_connection_status=excluded.twitch_connection_status,
  updated_at=now();

-- All rows predating multi-stream belong to the sole legacy broadcaster d1psy_off.
update public.rewards_rounds r
set streamer_id=st.id
from public.rewards_streamers st
where r.streamer_id is null and st.twitch_broadcaster_id='511100980';

update public.rewards_chat_events e
set streamer_id=st.id
from public.rewards_streamers st
where e.streamer_id is null and st.twitch_broadcaster_id='511100980';

-- Known isolated PoC broadcaster. Keep disabled until explicit activation.
insert into public.rewards_streamers(twitch_broadcaster_id,twitch_login,display_name,enabled,is_primary)
values ('39780903','amych','amych',false,false)
on conflict (twitch_broadcaster_id) do update set
  twitch_login=excluded.twitch_login,
  display_name=excluded.display_name,
  updated_at=now();
insert into public.rewards_streamer_settings(streamer_id,enabled)
select id,false from public.rewards_streamers where twitch_broadcaster_id='39780903'
on conflict (streamer_id) do nothing;

create or replace function public.rewards_finalize_round(p_round_id uuid)
returns table(winner_user_id uuid, prize_id uuid, completion_reason text)
language plpgsql
set search_path to ''
as $function$
declare
  v_round public.rewards_rounds%rowtype;
  v_prize public.rewards_prizes%rowtype;
  v_winner uuid;
  v_count integer;
  v_offset integer;
begin
  select * into v_round from public.rewards_rounds where id=p_round_id for update;
  if not found or v_round.status <> 'active' then raise exception 'round_not_active'; end if;
  if v_round.prize_id is null then raise exception 'round_prize_not_selected'; end if;
  select * into v_prize from public.rewards_prizes where id=v_round.prize_id for update;
  if not found or v_prize.status <> 'available' then raise exception 'prize_not_available'; end if;

  if v_round.streamer_id is null then
    if not exists (select 1 from public.rewards_settings where id=true and twitch_connection_status='connected') then raise exception 'twitch_not_connected'; end if;
  else
    if not exists (select 1 from public.rewards_streamer_settings where streamer_id=v_round.streamer_id and enabled=true and twitch_connection_status='connected') then raise exception 'twitch_not_connected'; end if;
  end if;

  select count(*) into v_count from public.rewards_round_participants where round_id=p_round_id and eligible=true;
  if v_count=0 then
    update public.rewards_rounds set status='completed',ended_at=now(),completion_reason='no_eligible_participants' where id=p_round_id;
    return query select null::uuid,v_prize.id,'no_eligible_participants'::text;
    return;
  end if;

  v_offset := public.rewards_crypto_index(v_count);
  select user_id into v_winner from public.rewards_round_participants where round_id=p_round_id and eligible=true order by user_id offset v_offset limit 1;
  insert into public.rewards_wins(round_id,user_id,prize_id) values(p_round_id,v_winner,v_prize.id);
  if not v_prize.unlimited then update public.rewards_prizes set status='assigned',updated_at=now() where id=v_prize.id; end if;
  update public.rewards_rounds set status='completed',ended_at=now(),completion_reason='winner_selected',winner_user_id=v_winner where id=p_round_id;
  insert into public.rewards_audit_log(action,entity_type,entity_id,details)
  values('round_finalized','rewards_rounds',p_round_id::text,jsonb_build_object('winner_user_id',v_winner,'prize_id',v_prize.id,'prize_unlimited',v_prize.unlimited,'rng','pgcrypto_rejection_sampling','streamer_id',v_round.streamer_id));
  return query select v_winner,v_prize.id,'winner_selected'::text;
end;
$function$;
revoke all on function public.rewards_finalize_round(uuid) from public, anon, authenticated;
grant execute on function public.rewards_finalize_round(uuid) to service_role;
