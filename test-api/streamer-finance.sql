-- Separate streamer funding. This ledger never writes user coins or rewards_* tables.
alter table public.amych_dashboard_settings drop constraint if exists amych_dashboard_settings_interval_seconds_check;
alter table public.amych_dashboard_settings drop constraint if exists amych_dashboard_settings_message_threshold_check;
update public.amych_dashboard_settings set interval_seconds=least(3600,greatest(1,interval_seconds)),message_threshold=least(1000,greatest(5,message_threshold)),version=version+1 where interval_seconds not between 1 and 3600 or message_threshold not between 5 and 1000;
alter table public.amych_dashboard_settings add constraint amych_dashboard_settings_interval_seconds_check check(interval_seconds between 1 and 3600);
alter table public.amych_dashboard_settings add constraint amych_dashboard_settings_message_threshold_check check(message_threshold between 5 and 1000);
alter table public.amych_dashboard_settings add column if not exists min_drop_coins integer not null default 2,add column if not exists max_drop_coins integer not null default 1000;
alter table public.amych_dashboard_settings drop constraint if exists streamer_drop_range_valid;
alter table public.amych_dashboard_settings add constraint streamer_drop_range_valid check(min_drop_coins>=2 and max_drop_coins<=1000 and min_drop_coins<=max_drop_coins);
create table if not exists public.isolated_streamer_prizes(id uuid primary key,name text not null check(length(name) between 1 and 160),price_coins integer not null check(price_coins between 2 and 1000),stock integer not null check(stock between 0 and 100000),initial_stock integer not null check(initial_stock between 1 and 100000),created_at timestamptz not null default clock_timestamp());
alter table public.amych_dashboard_rounds add column if not exists prize_id uuid references public.isolated_streamer_prizes(id),add column if not exists drop_cost integer check(drop_cost between 2 and 1000);
create table if not exists public.isolated_streamer_admin_identity(id boolean primary key default true check(id),actor_id text not null unique check(actor_id ~ '^[0-9]+$'));
create table if not exists public.isolated_streamer_wallet_entries(
 id uuid primary key default gen_random_uuid(),broadcaster_id text not null references public.amych_dashboard_settings(broadcaster_id),
 amount integer not null check(amount<>0),kind text not null check(kind in('topup','debit','refund')),request_id uuid,
 round_id uuid references public.amych_dashboard_rounds(id),actor_id text not null,admin_actor_id text references public.isolated_streamer_admin_identity(actor_id),created_at timestamptz not null default clock_timestamp(),
 unique(broadcaster_id,request_id),unique(round_id,kind),
 check((kind='topup' and amount>0 and admin_actor_id is not null and admin_actor_id=actor_id and request_id is not null and round_id is null) or (kind='debit' and amount<0 and round_id is not null) or (kind='refund' and amount>0 and round_id is not null))
);
create index if not exists isolated_streamer_wallet_history on public.isolated_streamer_wallet_entries(broadcaster_id,created_at desc);
create table if not exists public.isolated_streamer_admin_sessions(token_hash text primary key,actor_id text not null references public.isolated_streamer_admin_identity(actor_id),expires_at timestamptz not null);
alter table public.isolated_streamer_prizes enable row level security;
alter table public.isolated_streamer_wallet_entries enable row level security;
alter table public.isolated_streamer_admin_sessions enable row level security;
alter table public.isolated_streamer_admin_identity enable row level security;
revoke all on public.isolated_streamer_prizes,public.isolated_streamer_wallet_entries,public.isolated_streamer_admin_sessions,public.isolated_streamer_admin_identity from public;
-- Protect rolling deploys and future code paths: a new round cannot commit free,
-- and a cancelled/empty round cannot keep its reservation.
create or replace function public.isolated_streamer_round_budget_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.amych_dashboard_rounds; refunded boolean;
begin
 select * into r from public.amych_dashboard_rounds where id=new.id;
 if r.drop_cost is null or r.prize_id is null then
  if tg_op='INSERT' then raise exception 'streamer_budget_required';end if;
  return new;
 end if;
 if not exists(select 1 from public.isolated_streamer_wallet_entries where round_id=r.id and broadcaster_id=r.broadcaster_id and kind='debit' and amount=-r.drop_cost) then raise exception 'streamer_budget_required';end if;
 select exists(select 1 from public.isolated_streamer_wallet_entries where round_id=r.id and broadcaster_id=r.broadcaster_id and kind='refund' and amount=r.drop_cost) into refunded;
 if (r.status='cancelled' or (r.status='completed' and r.winner_id is null)) and not refunded then raise exception 'streamer_refund_required';end if;
 if (r.status='active' or r.winner_id is not null) and refunded then raise exception 'streamer_refund_invalid';end if;
 return new;
end $$;
revoke all on function public.isolated_streamer_round_budget_guard() from public;
drop trigger if exists isolated_streamer_round_budget_guard on public.amych_dashboard_rounds;
create constraint trigger isolated_streamer_round_budget_guard after insert or update on public.amych_dashboard_rounds deferrable initially deferred for each row execute function public.isolated_streamer_round_budget_guard();
