-- Closed design workspace. No public checkout, entitlements or wallet writes.
create table public.rewards_monetization_draft (
 id boolean primary key default true check(id),
 revision integer not null default 0 check(revision>=0),
 config jsonb not null default '{}'::jsonb check(jsonb_typeof(config)='object'),
 updated_at timestamptz not null default now(),
 updated_by text
);
insert into public.rewards_monetization_draft(id) values(true);
alter table public.rewards_monetization_draft enable row level security;
revoke all on public.rewards_monetization_draft from public,anon,authenticated;
grant select,update on public.rewards_monetization_draft to service_role;
notify pgrst,'reload schema';
