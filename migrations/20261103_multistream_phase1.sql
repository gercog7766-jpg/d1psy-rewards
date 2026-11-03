-- Multi-stream phase 1 schema.
-- IMPORTANT: do not apply to production until validated on a Supabase development branch.
-- This migration is additive and does not change existing rewards_users balances/shop/upgrader/OBS data.

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

-- At most one primary streamer.
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

alter table public.rewards_rounds
  add column if not exists streamer_id uuid null references public.rewards_streamers(id);

alter table public.rewards_chat_events
  add column if not exists streamer_id uuid null references public.rewards_streamers(id);

create index if not exists rewards_rounds_streamer_status_idx
  on public.rewards_rounds(streamer_id,status);
create index if not exists rewards_chat_events_streamer_idx
  on public.rewards_chat_events(streamer_id,occurred_at desc);

-- Prevent two simultaneous active rounds for the same streamer while still allowing
-- legacy rows (streamer_id is null) to coexist during the migration period.
create unique index if not exists rewards_rounds_one_active_per_streamer_idx
  on public.rewards_rounds(streamer_id) where status='active' and streamer_id is not null;

-- Amych is known from the completed isolated OAuth PoC. Keep disabled until the
-- development DB and per-streamer engine are validated end-to-end.
insert into public.rewards_streamers(twitch_broadcaster_id,twitch_login,display_name,enabled,is_primary)
values ('39780903','amych','amych',false,false)
on conflict (twitch_broadcaster_id) do update set
  twitch_login=excluded.twitch_login,
  display_name=excluded.display_name,
  updated_at=now();

insert into public.rewards_streamer_settings(streamer_id,enabled)
select id,false from public.rewards_streamers where twitch_broadcaster_id='39780903'
on conflict (streamer_id) do nothing;

-- The primary d1psy_off row and legacy-round backfill are intentionally NOT done here.
-- They must use the verified production broadcaster ID and be validated on the dev DB first.
