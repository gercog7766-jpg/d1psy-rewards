-- Dedicated isolated dashboard storage. Does not alter rewards_* fixture tables.
create table if not exists public.amych_dashboard_settings(
 broadcaster_id text primary key check(broadcaster_id='39780903'),mode text not null default 'time' check(mode in('time','messages')),
 interval_seconds integer not null default 300 check(interval_seconds between 60 and 86400),
 message_threshold integer not null default 100 check(message_threshold between 1 and 100000),
 prize_name text not null default 'Тестовый приз' check(length(prize_name) between 1 and 160),version integer not null default 0);
insert into public.amych_dashboard_settings(broadcaster_id) values('39780903') on conflict do nothing;
create table if not exists public.amych_dashboard_sessions(token_hash text primary key,broadcaster_id text not null references public.amych_dashboard_settings(broadcaster_id),expires_at timestamptz not null);
create index if not exists amych_dashboard_sessions_expiry on public.amych_dashboard_sessions(expires_at);
create table if not exists public.amych_dashboard_rounds(
 id uuid primary key,broadcaster_id text not null references public.amych_dashboard_settings(broadcaster_id),
 mode text not null check(mode in('time','messages')),interval_seconds integer not null,message_threshold integer not null,prize_name text not null,
 status text not null default 'active' check(status in('active','completed','cancelled')),started_at timestamptz not null default clock_timestamp(),deadline_at timestamptz,
 message_count integer not null default 0,winner_id text,winner_login text,finished_at timestamptz,reason text);
create unique index if not exists amych_dashboard_one_active on public.amych_dashboard_rounds(broadcaster_id) where status='active';
create index if not exists amych_dashboard_history on public.amych_dashboard_rounds(broadcaster_id,started_at desc);
create table if not exists public.amych_dashboard_participants(round_id uuid not null references public.amych_dashboard_rounds(id),twitch_user_id text not null,login text not null,primary key(round_id,twitch_user_id));
create table if not exists public.amych_dashboard_events(message_id text primary key,broadcaster_id text not null check(broadcaster_id='39780903'),received_at timestamptz not null default clock_timestamp());
alter table public.amych_dashboard_settings enable row level security;
alter table public.amych_dashboard_sessions enable row level security;
alter table public.amych_dashboard_rounds enable row level security;
alter table public.amych_dashboard_participants enable row level security;
alter table public.amych_dashboard_events enable row level security;
revoke all on public.amych_dashboard_settings,public.amych_dashboard_sessions,public.amych_dashboard_rounds,public.amych_dashboard_participants,public.amych_dashboard_events from public;
