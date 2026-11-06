-- Editable live quotes. Accepted bets retain their immutable odds snapshot.
create function public.rewards_live_valid_odds(p_key text,p_odds jsonb) returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare keys text[]; value jsonb; coefficient numeric;
begin
 keys:=case when p_key in('winner','regulation') then array['p1','p2'] when p_key='total' then array['over','under'] when p_key in('ace','knife','grenade') then array['yes','no'] end;
 if keys is null or p_odds is null or jsonb_typeof(p_odds)<>'object' then return false;end if;
 if not (p_odds ?& keys) or p_odds-keys<>'{}'::jsonb then return false;end if;
 for value in select j.value from jsonb_each(p_odds) j loop
  if jsonb_typeof(value)<>'number' then return false;end if;
  coefficient:=value::text::numeric;
  if coefficient<1.01 or coefficient>1000 or coefficient<>round(coefficient,2) then return false;end if;
 end loop;
 return true;
end $$;
alter table public.rewards_live_test_markets add column odds jsonb;
update public.rewards_live_test_markets set odds=case key
 when 'winner' then '{"p1":1.85,"p2":1.85}'::jsonb
 when 'regulation' then '{"p1":1.90,"p2":1.90}'::jsonb
 when 'total' then '{"over":1.85,"under":1.85}'::jsonb
 when 'ace' then '{"yes":8.00,"no":1.05}'::jsonb
 when 'knife' then '{"yes":3.00,"no":1.36}'::jsonb
 when 'grenade' then '{"yes":20.00,"no":1.02}'::jsonb end;
alter table public.rewards_live_test_markets alter column odds set not null;
alter table public.rewards_live_test_markets add constraint rewards_live_odds_valid check(public.rewards_live_valid_odds(key,odds));
create function public.rewards_live_configure(p_key text,p_version integer,p_enabled boolean,p_result text,p_odds jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.rewards_live_test_markets;
begin
 if not public.rewards_live_valid_odds(p_key,p_odds) then raise exception 'invalid_odds';end if;
 update public.rewards_live_test_markets set enabled=p_enabled,result=p_result,odds=p_odds,version=version+1,updated_at=now() where key=p_key and version=p_version returning * into m;
 if not found then raise exception 'live_changed';end if;
 return to_jsonb(m);
end $$;
revoke all on function public.rewards_live_valid_odds(text,jsonb),public.rewards_live_configure(text,integer,boolean,text,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_live_valid_odds(text,jsonb),public.rewards_live_configure(text,integer,boolean,text,jsonb) to service_role;

create or replace function public.rewards_live_place_bet(p_user uuid,p_key text,p_outcome text,p_stake integer,p_version integer,p_request uuid) returns jsonb language plpgsql set search_path='' as $$
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
 coefficient:=(m.odds->>p_outcome)::numeric;
 if coefficient is null then raise exception 'invalid_bet'; end if;
 select coalesce(sum(amount),0) into balance from public.rewards_coin_transactions where user_id=p_user;
 if balance<p_stake then raise exception 'insufficient_coins'; end if;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user,-p_stake,'adjustment','Live · ставка · '||p_key||' · '||p_outcome||' · '||p_request) returning id into tx;
 insert into public.rewards_live_bets(user_id,market_key,generation,outcome,stake,odds,request_id,debit_id) values(p_user,p_key,m.generation,p_outcome,p_stake,coefficient,p_request,tx) returning * into b;
 return to_jsonb(b);
end $$;
