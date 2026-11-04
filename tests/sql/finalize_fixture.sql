-- Disposable PostgreSQL ONLY. Minimal schema needed to execute the real
-- rewards_finalize_round definition from the phase-1 migration.
\set ON_ERROR_STOP on
create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table public.rewards_streamers (
  id uuid primary key, enabled boolean not null, is_primary boolean not null
);
create table public.rewards_prizes (
  id uuid primary key, status text not null, unlimited boolean not null default false,
  updated_at timestamptz default now()
);
create table public.rewards_streamer_settings (
  streamer_id uuid primary key references public.rewards_streamers(id),
  enabled boolean not null, twitch_connection_status text not null,
  updated_at timestamptz default now()
);
create table public.rewards_settings (
  id boolean primary key, twitch_connection_status text not null
);
create table public.rewards_rounds (
  id uuid primary key default gen_random_uuid(),
  streamer_id uuid references public.rewards_streamers(id),
  prize_id uuid references public.rewards_prizes(id),
  status text not null, ended_at timestamptz, completion_reason text,
  winner_user_id uuid
);
create unique index rewards_rounds_one_active_per_streamer_idx
  on public.rewards_rounds(streamer_id) where status='active';
create table public.rewards_round_participants (
  round_id uuid references public.rewards_rounds(id),
  user_id uuid not null, eligible boolean not null
);
create table public.rewards_wins (
  round_id uuid not null, user_id uuid not null, prize_id uuid not null
);
create table public.rewards_audit_log (
  action text not null, entity_type text not null, entity_id text, details jsonb
);
-- Deterministic stand-in for the random index; this suite tests transaction
-- semantics, NOT RNG quality. The real finalization body is loaded unchanged.
create function public.rewards_crypto_index(p_count integer)
returns integer language sql as $$ select 0 $$;
insert into public.rewards_streamers values
 ('00000000-0000-4000-8000-000000000001',true,true),
 ('00000000-0000-4000-8000-000000000002',true,false);
insert into public.rewards_streamer_settings values
 ('00000000-0000-4000-8000-000000000001',true,'connected'),
 ('00000000-0000-4000-8000-000000000002',true,'connected');
insert into public.rewards_settings values (true,'connected');
insert into public.rewards_prizes(id,status) values
 ('10000000-0000-4000-8000-000000000001','available'),
 ('10000000-0000-4000-8000-000000000002','available');
insert into public.rewards_rounds(id,streamer_id,prize_id,status) values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','active'),
 ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','active');
insert into public.rewards_round_participants values
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',true),
 ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',true);
