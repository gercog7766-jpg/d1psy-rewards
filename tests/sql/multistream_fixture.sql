-- Disposable fixture for GitHub Actions PostgreSQL only.
create extension if not exists pgcrypto;
do $$ begin
  create role anon;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role;
exception when duplicate_object then null; end $$;
create schema if not exists public;
create table public.rewards_streamers (
  id uuid primary key default gen_random_uuid(),
  twitch_broadcaster_id text not null unique,
  enabled boolean not null default false,
  is_primary boolean not null default false
);
create table public.rewards_prizes (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'available'
);
create table public.rewards_streamer_settings (
  streamer_id uuid primary key references public.rewards_streamers(id),
  enabled boolean not null default false,
  mode text not null default 'time',
  interval_seconds integer not null default 300,
  message_threshold integer not null default 100,
  selected_prize_id uuid references public.rewards_prizes(id),
  twitch_connection_status text not null default 'disconnected',
  updated_at timestamptz not null default now()
);
create table public.rewards_rounds (
  id uuid primary key default gen_random_uuid(),
  streamer_id uuid references public.rewards_streamers(id),
  mode text not null,
  status text not null default 'active',
  interval_seconds integer,
  message_threshold integer,
  prize_id uuid references public.rewards_prizes(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  completion_reason text
);
create unique index rewards_rounds_one_active_per_streamer_idx
  on public.rewards_rounds(streamer_id)
  where status = 'active' and streamer_id is not null;
insert into public.rewards_streamers(id,twitch_broadcaster_id,enabled,is_primary) values
  ('00000000-0000-4000-8000-000000000001','511100980',true,true),
  ('00000000-0000-4000-8000-000000000002','39780903',true,false),
  ('00000000-0000-4000-8000-000000000003','TEST_ONLY',true,false);
insert into public.rewards_streamer_settings(streamer_id,twitch_connection_status)
select id,'connected' from public.rewards_streamers;
insert into public.rewards_prizes(id,status) values
  ('10000000-0000-4000-8000-000000000001','available');

create table public.rewards_settings (
  id boolean primary key default true,
  enabled boolean not null default true,
  mode text not null default 'time',
  interval_seconds integer not null default 300,
  message_threshold integer not null default 100,
  twitch_connection_status text not null default 'connected',
  selected_prize_id uuid,
  updated_at timestamptz not null default now()
);
insert into public.rewards_settings(id) values(true);
