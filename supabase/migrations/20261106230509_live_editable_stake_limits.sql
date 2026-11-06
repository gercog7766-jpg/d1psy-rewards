-- Per-event stake limits; existing accepted stakes and payouts are unchanged.
alter table public.rewards_live_test_markets add column min_stake integer not null default 5,
 add column max_stake integer not null default 150,
 add constraint rewards_live_stake_limits_valid check(min_stake>=1 and max_stake>=min_stake and max_stake<=1000000);
-- The maximum possible payout is 1,000,000 × 1,000 = 1,000,000,000, within the integer ledger.
alter table public.rewards_live_bets drop constraint rewards_live_bets_stake_check;
alter table public.rewards_live_bets add constraint rewards_live_bets_stake_check check(stake between 1 and 1000000);
create function public.rewards_live_configure_limits(p_key text,p_version integer,p_enabled boolean,p_result text,p_odds jsonb,p_min_stake integer,p_max_stake integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.rewards_live_test_markets;
begin
 if p_min_stake is null or p_max_stake is null or p_min_stake<1 or p_max_stake<p_min_stake or p_max_stake>1000000 then raise exception 'invalid_limits';end if;
 if not public.rewards_live_valid_odds(p_key,p_odds) then raise exception 'invalid_odds';end if;
 update public.rewards_live_test_markets set enabled=p_enabled,result=p_result,odds=p_odds,min_stake=p_min_stake,max_stake=p_max_stake,version=version+1,updated_at=now() where key=p_key and version=p_version returning * into m;
 if not found then raise exception 'live_changed';end if;
 return to_jsonb(m);
end $$;
revoke all on function public.rewards_live_configure_limits(text,integer,boolean,text,jsonb,integer,integer) from public,anon,authenticated;
grant execute on function public.rewards_live_configure_limits(text,integer,boolean,text,jsonb,integer,integer) to service_role;

create or replace function public.rewards_live_place_bet(p_user uuid,p_key text,p_outcome text,p_stake integer,p_version integer,p_request uuid) returns jsonb language plpgsql set search_path='' as $$
declare m public.rewards_live_test_markets; b public.rewards_live_bets; coefficient numeric; tx uuid; balance bigint;
begin
 if p_request is null or p_stake is null or p_stake<1 or p_stake>1000000 then raise exception 'invalid_bet'; end if;
 select * into m from public.rewards_live_test_markets where key=p_key for update;
 if not found then raise exception 'invalid_bet'; end if;
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) and not coalesce(participation_restricted,false) for update;
 if not found then raise exception 'user_unavailable'; end if;
 select * into b from public.rewards_live_bets where user_id=p_user and request_id=p_request;
 if found then
  if b.market_key<>p_key or b.outcome<>p_outcome or b.stake<>p_stake then raise exception 'request_conflict'; end if;
  return to_jsonb(b);
 end if;
 if not m.enabled or m.result is not null then raise exception 'market_closed'; end if;
 if p_version is null or m.version<>p_version then raise exception 'live_changed'; end if;
 -- Check limits only for a new bet; retries return the original receipt above.
 if p_stake<m.min_stake or p_stake>m.max_stake then raise exception 'stake_out_of_range';end if;
 coefficient:=(m.odds->>p_outcome)::numeric;
 if coefficient is null then raise exception 'invalid_bet'; end if;
 select coalesce(sum(amount),0) into balance from public.rewards_coin_transactions where user_id=p_user;
 if balance<p_stake then raise exception 'insufficient_coins'; end if;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user,-p_stake,'adjustment','Live · ставка · '||p_key||' · '||p_outcome||' · '||p_request) returning id into tx;
 insert into public.rewards_live_bets(user_id,market_key,generation,outcome,stake,odds,request_id,debit_id) values(p_user,p_key,m.generation,p_outcome,p_stake,coefficient,p_request,tx) returning * into b;
 return to_jsonb(b);
end $$;
