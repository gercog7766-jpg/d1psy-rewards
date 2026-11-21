-- A provider event is consumed even if no raid is active. Reconnect/replay must
-- not turn an old ignored donation into a new attack.
create table public.rewards_boss_ihaq_receipts(
 event_id uuid primary key, received_at timestamptz not null,
 result jsonb not null default '{}'
);
alter table public.rewards_boss_ihaq_receipts enable row level security;
revoke all on public.rewards_boss_ihaq_receipts from public,anon,authenticated;
grant select,insert,update on public.rewards_boss_ihaq_receipts to service_role;
create function public.rewards_boss_ihaq_event(p_event uuid,p_donor text,p_rub numeric,p_code uuid,p_at timestamptz) returns jsonb
language plpgsql set search_path='' as $$
declare outcome jsonb;
begin
 if p_event is null or p_at is null or p_at>clock_timestamp()+interval '30 seconds' or p_at<clock_timestamp()-interval '10 minutes' or p_rub is null or p_rub<0.5 or p_rub>10000000 then raise exception 'invalid_event';end if;
 perform pg_advisory_xact_lock(78104921);
 insert into public.rewards_boss_ihaq_receipts(event_id,received_at) values(p_event,p_at) on conflict do nothing;
 if not found then return '{"duplicate":true}';end if;
 begin
  outcome:=public.rewards_boss_hit('ihaq',p_event::text,null,p_donor,p_rub,1,p_code,p_at,false);
 exception when raise_exception then
  if SQLERRM not in ('boss_inactive','event_outside_battle') then raise;end if;
  outcome:=jsonb_build_object('ignored',SQLERRM);
 end;
 update public.rewards_boss_ihaq_receipts set result=outcome where event_id=p_event;
 return outcome;
end$$;
revoke all on function public.rewards_boss_ihaq_event(uuid,text,numeric,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.rewards_boss_ihaq_event(uuid,text,numeric,uuid,timestamptz) to service_role;
notify pgrst,'reload schema';
