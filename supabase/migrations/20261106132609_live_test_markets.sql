-- Isolated demo state: no user wagers, balances, rewards or selections.
create table public.rewards_live_test_markets(
 key text primary key check(key in('winner','regulation','total','ace','knife','grenade')),
 enabled boolean not null default false,
 result text,
 version integer not null default 0 check(version>=0),
 updated_at timestamptz not null default now(),
 check(not enabled or result is null),
 check(result is null or result='void' or
  (key='winner' and result in('p1','p2')) or
  (key='regulation' and result in('p1','p2','draw')) or
  (key='total' and result in('over','under')) or
  (key in('ace','knife','grenade') and result in('yes','no')))
);
alter table public.rewards_live_test_markets enable row level security;
revoke all on public.rewards_live_test_markets from public,anon,authenticated;
grant select,update on public.rewards_live_test_markets to service_role;
insert into public.rewards_live_test_markets(key) values('winner'),('regulation'),('total'),('ace'),('knife'),('grenade');
