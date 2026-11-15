-- Lock out concurrent entries and settlement while returning outstanding funds.
lock table public.rewards_blind_rounds, public.rewards_blind_entries,
  public.rewards_piggy_entries, public.rewards_piggy_days in access exclusive mode nowait;

revoke execute on function public.rewards_blind_start(uuid,integer,integer,integer,integer),
  public.rewards_blind_play(uuid,uuid,integer),
  public.rewards_piggy_add(uuid,date,bigint,uuid) from service_role;

-- Keep the old release's background workers harmless until the VPS switches.
create or replace function public.rewards_blind_finish(p_cancel uuid default null) returns void
language plpgsql security invoker set search_path = '' as $$ begin return; end; $$;
create or replace function public.rewards_piggy_close() returns void
language plpgsql security invoker set search_path = '' as $$ begin return; end; $$;

with cancelled as (
  update public.rewards_blind_rounds
  set status = 'cancelled', closed_at = clock_timestamp()
  where status = 'open'
  returning id, entry_fee
)
insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
select e.user_id,c.entry_fee,'adjustment','Слепой финал · возврат · ' || c.id
from cancelled c join public.rewards_blind_entries e on e.round_id = c.id
where c.entry_fee > 0;

do $$
declare
  entry record;
  outstanding bigint;
  chunk integer;
begin
  for entry in
    with closed as (
      insert into public.rewards_piggy_days(day,status,pot,prize_budget)
      select e.day,'refunded',sum(e.amount),0
      from public.rewards_piggy_entries e
      where not exists(select 1 from public.rewards_piggy_days d where d.day = e.day)
      group by e.day
      on conflict (day) do nothing
      returning day
    )
    select e.day,e.user_id,e.amount from closed c
    join public.rewards_piggy_entries e on e.day = c.day
  loop
    outstanding := entry.amount;
    while outstanding > 0 loop
      chunk := least(outstanding,2147483647)::integer;
      insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
      values(entry.user_id,chunk,'adjustment','Копилка · возврат · ' || entry.day);
      outstanding := outstanding - chunk;
    end loop;
  end loop;
end;
$$;

revoke insert, update on public.rewards_blind_rounds, public.rewards_blind_entries,
  public.rewards_piggy_entries, public.rewards_piggy_payments,
  public.rewards_piggy_days, public.rewards_piggy_winners from service_role;
