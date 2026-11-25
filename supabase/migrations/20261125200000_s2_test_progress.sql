-- Isolated admin simulation: no production season, wallet or inventory writes.
create table public.rewards_s2_test_profiles (
 actor text not null,
 sample integer not null check(sample between 1 and 999),
 revision integer not null default 0 check(revision>=0),
 state jsonb not null check(jsonb_typeof(state)='object'),
 updated_at timestamptz not null default now(),
 primary key(actor,sample)
);
alter table public.rewards_s2_test_profiles enable row level security;
revoke all on public.rewards_s2_test_profiles from public,anon,authenticated;
grant select,insert,update on public.rewards_s2_test_profiles to service_role;
notify pgrst,'reload schema';
