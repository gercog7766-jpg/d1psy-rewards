-- Real Live wagers use the existing user coin ledger. All operations are server-only.
alter table public.rewards_live_test_markets add column generation integer not null default 1 check(generation>0);
create table public.rewards_live_bets(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.rewards_users(id),
 market_key text not null references public.rewards_live_test_markets(key),
 generation integer not null,
 outcome text not null,
 stake integer not null check(stake between 5 and 150),
 odds numeric(6,2) not null check(odds>=1),
 request_id uuid not null,
 debit_id uuid not null references public.rewards_coin_transactions(id),
 payout_id uuid references public.rewards_coin_transactions(id),
 status text not null default 'pending' check(status in('pending','won','lost','refunded')),
 payout integer not null default 0 check(payout>=0),
 created_at timestamptz not null default now(),
 settled_at timestamptz,
 unique(user_id,request_id),
 check((market_key in('winner','regulation') and outcome in('p1','p2')) or (market_key='total' and outcome in('over','under')) or (market_key in('ace','knife','grenade') and outcome in('yes','no')))
);
create index rewards_live_bets_pending on public.rewards_live_bets(market_key,generation,user_id) where status='pending';
create index rewards_live_bets_user on public.rewards_live_bets(user_id,created_at desc);
create index rewards_live_bets_created on public.rewards_live_bets(created_at desc,id);
create index rewards_live_bets_debit on public.rewards_live_bets(debit_id);
create index rewards_live_bets_payout on public.rewards_live_bets(payout_id);
alter table public.rewards_live_bets enable row level security;
revoke all on public.rewards_live_bets from public,anon,authenticated;
grant select,insert,update on public.rewards_live_bets to service_role;

create function public.rewards_live_place_bet(p_user uuid,p_key text,p_outcome text,p_stake integer,p_version integer,p_request uuid) returns jsonb language plpgsql set search_path='' as $$
declare m public.rewards_live_test_markets; b public.rewards_live_bets; coefficient numeric; tx uuid; balance bigint;
begin
 if p_request is null or p_stake is null or p_stake<5 or p_stake>150 then raise exception 'invalid_bet'; end if;
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
 coefficient:=case
 when p_key='winner' and p_outcome in('p1','p2') then 1.85
 when p_key='regulation' and p_outcome in('p1','p2') then 1.90
 when p_key='total' and p_outcome in('over','under') then 1.85
 when p_key='ace' and p_outcome='yes' then 8.00 when p_key='ace' and p_outcome='no' then 1.05
 when p_key='knife' and p_outcome='yes' then 3.00 when p_key='knife' and p_outcome='no' then 1.36
 when p_key='grenade' and p_outcome='yes' then 20.00 when p_key='grenade' and p_outcome='no' then 1.02 end;
 if coefficient is null then raise exception 'invalid_bet'; end if;
 select coalesce(sum(amount),0) into balance from public.rewards_coin_transactions where user_id=p_user;
 if balance<p_stake then raise exception 'insufficient_coins'; end if;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user,-p_stake,'adjustment','Live · ставка · '||p_key||' · '||p_outcome||' · '||p_request) returning id into tx;
 insert into public.rewards_live_bets(user_id,market_key,generation,outcome,stake,odds,request_id,debit_id) values(p_user,p_key,m.generation,p_outcome,p_stake,coefficient,p_request,tx) returning * into b;
 return to_jsonb(b);
end $$;

-- Trigger also guards an old application instance during a rolling deploy.
create function public.rewards_live_market_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if old.result is not null and new.result is not null and new.result<>old.result then raise exception 'result_locked'; end if;
 if old.result is not null and new.result is null then new.generation:=old.generation+1;
 else new.generation:=old.generation; end if;
 return new;
end $$;
create trigger rewards_live_market_guard before update on public.rewards_live_test_markets for each row execute function public.rewards_live_market_guard();
create function public.rewards_live_settle() returns trigger language plpgsql set search_path='' as $$
declare b public.rewards_live_bets; amount integer; tx uuid;
begin
 if new.result is null or old.result is not null then return new; end if;
 -- Match the ledger's user-row locking protocol, in deterministic order.
 perform 1 from public.rewards_users where id in(select user_id from public.rewards_live_bets where market_key=new.key and generation=new.generation and status='pending') order by id for update;
 for b in select * from public.rewards_live_bets where market_key=new.key and generation=new.generation and status='pending' order by user_id,id for update loop
  amount:=case when new.result in('void','draw') then b.stake when b.outcome=new.result then round(b.stake*b.odds)::integer else 0 end;
  tx:=null;
  if amount>0 then
   insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(b.user_id,amount,'adjustment','Live · '||case when new.result in('void','draw') then 'возврат' else 'выигрыш' end||' · '||b.id) returning id into tx;
  end if;
  update public.rewards_live_bets set status=case when new.result in('void','draw') then 'refunded' when b.outcome=new.result then 'won' else 'lost' end,payout=amount,payout_id=tx,settled_at=now() where id=b.id;
 end loop;
 return new;
end $$;
create trigger rewards_live_settle after update on public.rewards_live_test_markets for each row execute function public.rewards_live_settle();
create function public.rewards_live_update(p_key text,p_version integer,p_enabled boolean,p_result text) returns jsonb language plpgsql set search_path='' as $$
declare m public.rewards_live_test_markets;
begin
 update public.rewards_live_test_markets set enabled=p_enabled,result=p_result,version=version+1,updated_at=now() where key=p_key and version=p_version returning * into m;
 if not found then raise exception 'live_changed'; end if;
 return to_jsonb(m);
end $$;
create function public.rewards_live_user_state(p_user uuid) returns jsonb language sql set search_path='' as $$
 select jsonb_build_object('markets',(select jsonb_agg(m order by m.key) from public.rewards_live_test_markets m),'balance',(select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=p_user),'bets',(select coalesce(jsonb_agg(b order by b.created_at desc),'[]') from (select id,market_key,generation,outcome,stake,odds,status,payout,created_at,settled_at from public.rewards_live_bets where user_id=p_user order by created_at desc limit 100) b))
$$;
revoke all on function public.rewards_live_place_bet(uuid,text,text,integer,integer,uuid),public.rewards_live_market_guard(),public.rewards_live_settle(),public.rewards_live_update(text,integer,boolean,text),public.rewards_live_user_state(uuid) from public,anon,authenticated;
grant execute on function public.rewards_live_place_bet(uuid,text,text,integer,integer,uuid),public.rewards_live_market_guard(),public.rewards_live_settle(),public.rewards_live_update(text,integer,boolean,text),public.rewards_live_user_state(uuid) to service_role;
