-- V2: qualification is earned activity, not participation. No historical payouts.
drop trigger if exists rewards_referral_first_participation on public.rewards_round_participants;
alter table public.rewards_referrals add column eligible_earned_coins bigint not null default 0 check(eligible_earned_coins>=0), add column login_verified_at timestamptz, add column signup_bonus_coins integer;
create table public.rewards_referral_codes(user_id uuid primary key references public.rewards_users(id),code text not null unique check(code ~ '^[a-f0-9]{24}$'));
create table public.rewards_referral_events(
 id uuid primary key default gen_random_uuid(),referrer_user_id uuid not null,referred_user_id uuid not null references public.rewards_referrals(referred_user_id),
 event_kind text not null check(event_kind in ('qualification','withdrawal','upgrade_loss')),source_id uuid not null,basis_coins bigint not null check(basis_coins>0),amount_hundredths bigint not null check(amount_hundredths>0),created_at timestamptz not null default now(),settled_at timestamptz,settlement_id uuid references public.rewards_coin_transactions(id),unique(event_kind,source_id));
-- Parent UUID comes only from the immutable referral relation. Avoid a parent-user
-- FK here: gameplay holds the child's locks; payouts run in a separate transaction.
create index rewards_referral_events_unsettled on public.rewards_referral_events(referrer_user_id,created_at,id) where settled_at is null;
create index rewards_referral_events_history on public.rewards_referral_events(referrer_user_id,created_at desc,id);
create index if not exists rewards_referrals_parent on public.rewards_referrals(referrer_user_id,created_at desc);
create table public.rewards_referral_wallets(user_id uuid primary key references public.rewards_users(id),remainder_hundredths bigint not null default 0 check(remainder_hundredths between 0 and 99),paid_coins bigint not null default 0 check(paid_coins>=0));
alter table public.rewards_referral_codes enable row level security;
alter table public.rewards_referral_events enable row level security;
alter table public.rewards_referral_wallets enable row level security;
revoke all on public.rewards_referral_codes,public.rewards_referral_events,public.rewards_referral_wallets from public,anon,authenticated;
grant select,insert,update on public.rewards_referral_codes,public.rewards_referral_events,public.rewards_referral_wallets to service_role;
alter table public.rewards_coin_transactions drop constraint rewards_coin_transactions_transaction_type_check;
alter table public.rewards_coin_transactions add constraint rewards_coin_transactions_transaction_type_check check(transaction_type in ('win_sale','shop_purchase','adjustment','level_reward','gift_sent','gift_received','referral_reward'));

create or replace function public.rewards_sell_win(p_win_id uuid,p_user_id uuid) returns integer language plpgsql security invoker set search_path='' as $$
declare price integer;balance integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select p.sell_price_coins into price from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id where w.id=p_win_id and w.user_id=p_user_id and w.choice_status='awaiting_choice' and w.delivery_status in ('awaiting_choice','pending') for update of w;
 if not found then raise exception 'win_not_available';end if;
 if price is null or price<=0 then raise exception 'sale_price_not_set';end if;
 update public.rewards_wins set choice_status='sold',choice_at=now(),sold_for_coins=price where id=p_win_id;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,win_id) values(p_user_id,price,'win_sale',p_win_id);
 select coalesce(sum(amount),0)::integer into balance from public.rewards_coin_transactions where user_id=p_user_id;return balance;
end $$;

create function public.rewards_referral_same_steam(a uuid,b uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((select ltrim(substring(x.steam_trade_url from '[?&]partner=([0-9]+)'),'0')=ltrim(substring(y.steam_trade_url from '[?&]partner=([0-9]+)'),'0') from public.rewards_users x cross join public.rewards_users y where x.id=a and y.id=b and x.steam_trade_url_valid and y.steam_trade_url_valid),false)
$$;
create function public.rewards_referral_code(p_user uuid) returns text language plpgsql security invoker set search_path='' as $$
declare c text;begin
 if not exists(select 1 from public.rewards_users where id=p_user and not banned) then raise exception 'user_unavailable';end if;
 insert into public.rewards_referral_codes(user_id,code) values(p_user,substr(replace(gen_random_uuid()::text,'-',''),1,24)) on conflict(user_id) do nothing;
 select code into c from public.rewards_referral_codes where user_id=p_user;return c;end $$;
create function public.rewards_referral_bind(p_user uuid,p_code text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare parent uuid;begin
 -- Binding is rare; one global lock prevents simultaneous reciprocal/cyclic links.
 perform pg_advisory_xact_lock(704019260011::bigint);
 if not exists(select 1 from public.rewards_users where id=p_user and not banned) then raise exception 'user_unavailable';end if;
 if exists(select 1 from public.rewards_referrals where referred_user_id=p_user) then return jsonb_build_object('ok',true,'status','already_bound');end if;
 select c.user_id into parent from public.rewards_referral_codes c join public.rewards_users u on u.id=c.user_id where c.code=p_code and not u.banned;
 if parent is null then return jsonb_build_object('ok',false,'status','invalid_code');end if;
 if parent=p_user or public.rewards_referral_same_steam(parent,p_user) then return jsonb_build_object('ok',false,'status','self_referral');end if;
 if exists(with recursive chain as(select referrer_user_id from public.rewards_referrals where referred_user_id=parent union select r.referrer_user_id from public.rewards_referrals r join chain c on r.referred_user_id=c.referrer_user_id) select 1 from chain where referrer_user_id=p_user) then return jsonb_build_object('ok',false,'status','referral_cycle');end if;
 insert into public.rewards_referrals(referred_user_id,referrer_user_id,login_verified_at) values(p_user,parent,now()) on conflict do nothing;
 return jsonb_build_object('ok',true,'status','bound');end $$;
create or replace function public.rewards_qualify_referral(p_referred_user_id uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.rewards_referrals;bonus integer;begin
 select * into r from public.rewards_referrals where referred_user_id=p_referred_user_id for update;
 if not found or r.signup_bonus_paid_at is not null or r.eligible_earned_coins<50 or r.login_verified_at is null then return false;end if;
 if not exists(select 1 from public.rewards_users where id=p_referred_user_id and not banned and steam_trade_url_valid) or not exists(select 1 from public.rewards_users where id=r.referrer_user_id and not banned) or public.rewards_referral_same_steam(r.referrer_user_id,p_referred_user_id) then return false;end if;
 select case when exists(select 1 from public.rewards_streamer_live_profiles s join public.rewards_users u on u.twitch_user_id=s.broadcaster_id where u.id=r.referrer_user_id and s.status='approved') or exists(select 1 from public.rewards_streamers s join public.rewards_users u on u.twitch_user_id=s.twitch_broadcaster_id where u.id=r.referrer_user_id and s.is_primary and s.enabled) then 5 else 15 end into bonus;
 insert into public.rewards_referral_events(referrer_user_id,referred_user_id,event_kind,source_id,basis_coins,amount_hundredths) values(r.referrer_user_id,p_referred_user_id,'qualification',p_referred_user_id,50,bonus*100) on conflict do nothing;
 update public.rewards_referrals set qualified_at=coalesce(qualified_at,now()),signup_bonus_paid_at=now(),signup_bonus_coins=bonus where referred_user_id=p_referred_user_id;
 return true;end $$;
create function public.rewards_referral_coin_event() returns trigger language plpgsql security invoker set search_path='' as $$
declare eligible boolean:=false;begin
 if new.amount<=0 or not exists(select 1 from public.rewards_referrals where referred_user_id=new.user_id and signup_bonus_paid_at is null and login_verified_at is not null and new.created_at>=created_at) then return new;end if;
 if new.transaction_type='win_sale' and new.win_id is not null then
 select exists(select 1 from public.rewards_wins w where w.id=new.win_id and w.user_id=new.user_id and w.choice_status='sold' and w.sold_for_coins=new.amount and w.source_type is distinct from 'shop' and (w.round_id is not null or w.source_type='season' or (w.source_type='upgrader' and exists(select 1 from public.rewards_upgrades a where a.reward_win_id=w.id and a.result='won')) or exists(select 1 from public.rewards_streamer_live_awards a where a.win_id=w.id and a.round_id is not null))) into eligible;
 elsif new.transaction_type='adjustment' and new.note ~ '^Ежедневный бонус · день [1-7]$' then eligible:=true;
 elsif new.transaction_type='level_reward' and new.note ~ '^Battle Pass S[0-9]+ · LVL [0-9]+$' then eligible:=true;end if;
 if eligible then update public.rewards_referrals set eligible_earned_coins=eligible_earned_coins+new.amount where referred_user_id=new.user_id and signup_bonus_paid_at is null;perform public.rewards_qualify_referral(new.user_id);end if;
 return new;end $$;
create trigger rewards_referral_coins_v2 after insert on public.rewards_coin_transactions for each row execute function public.rewards_referral_coin_event();
create function public.rewards_referral_trade_event() returns trigger language plpgsql security invoker set search_path='' as $$
begin if new.steam_trade_url_valid and (new.steam_trade_url_valid is distinct from old.steam_trade_url_valid or new.steam_trade_url is distinct from old.steam_trade_url) then perform public.rewards_qualify_referral(new.id);end if;return new;end $$;
create trigger rewards_referral_trade_v2 after update of steam_trade_url,steam_trade_url_valid on public.rewards_users for each row execute function public.rewards_referral_trade_event();
create function public.rewards_referral_record(p_referred uuid,p_kind text,p_source uuid,p_basis bigint) returns void language plpgsql security invoker set search_path='' as $$
declare parent uuid;rate integer;begin
 if p_kind not in('withdrawal','upgrade_loss') or coalesce(p_basis,0)<=0 then return;end if;
 select r.referrer_user_id into parent from public.rewards_referrals r join public.rewards_users u on u.id=r.referred_user_id join public.rewards_users p on p.id=r.referrer_user_id where r.referred_user_id=p_referred and r.login_verified_at is not null and not u.banned and not p.banned;
 if parent is null or public.rewards_referral_same_steam(parent,p_referred) then return;end if;
 rate:=case p_kind when 'withdrawal' then 2 else 1 end;
 insert into public.rewards_referral_events(referrer_user_id,referred_user_id,event_kind,source_id,basis_coins,amount_hundredths) values(parent,p_referred,p_kind,p_source,p_basis,p_basis*rate) on conflict do nothing;
end $$;
create function public.rewards_referral_order_snapshot() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.source_type='win' and new.win_id is not null and new.price_coins is null then select p.sell_price_coins into new.price_coins from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id where w.id=new.win_id and w.user_id=new.user_id;end if;
 return new;end $$;
create trigger rewards_referral_order_snapshot_v2 before insert or update of status on public.rewards_orders for each row execute function public.rewards_referral_order_snapshot();
create function public.rewards_referral_order_event() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='sent' and (tg_op='INSERT' or old.status is distinct from 'sent') then perform public.rewards_referral_record(new.user_id,'withdrawal',coalesce(new.win_id,new.id),new.price_coins);end if;return new;end $$;
create trigger rewards_referral_order_v2 after insert or update of status on public.rewards_orders for each row execute function public.rewards_referral_order_event();
create function public.rewards_referral_win_delivery() returns trigger language plpgsql security invoker set search_path='' as $$
declare basis bigint;begin
 if new.delivery_status='received' and old.delivery_status is distinct from 'received' and new.choice_status='claimed' then
 select o.price_coins into basis from public.rewards_orders o where o.win_id=new.id;
 if basis is null then select sell_price_coins into basis from public.rewards_prizes where id=new.prize_id;end if;
 perform public.rewards_referral_record(new.user_id,'withdrawal',new.id,basis);end if;return new;end $$;
create trigger rewards_referral_win_v2 after update of delivery_status on public.rewards_wins for each row execute function public.rewards_referral_win_delivery();
create function public.rewards_referral_upgrade_event() returns trigger language plpgsql security invoker set search_path='' as $$
begin if new.result='lost' then perform public.rewards_referral_record(new.user_id,'upgrade_loss',new.id,new.source_value_coins);end if;return new;end $$;
create trigger rewards_referral_upgrade_v2 after insert on public.rewards_upgrades for each row execute function public.rewards_referral_upgrade_event();

-- Worker only. Separate transaction from gameplay avoids cross-user balance locks.
create function public.rewards_referral_settle(p_limit integer default 30) returns integer language plpgsql security invoker set search_path='' as $$
declare parent uuid;wallet public.rewards_referral_wallets;ids uuid[];total bigint;due bigint;tx uuid;n integer:=0;begin
 if p_limit not between 1 and 100 then raise exception 'invalid_request';end if;
 for parent in select e.referrer_user_id from public.rewards_referral_events e join public.rewards_users u on u.id=e.referrer_user_id where e.settled_at is null and not u.banned group by e.referrer_user_id order by min(e.created_at),e.referrer_user_id limit p_limit loop
 insert into public.rewards_referral_wallets(user_id) values(parent) on conflict do nothing;
 select * into wallet from public.rewards_referral_wallets where user_id=parent for update;
 select array_agg(id),coalesce(sum(amount_hundredths),0) into ids,total from (select id,amount_hundredths from public.rewards_referral_events where referrer_user_id=parent and settled_at is null order by created_at,id limit 5000 for update) e;
 if total=0 then continue;end if;
 total:=total+wallet.remainder_hundredths;due:=total/100;tx:=null;
 if due>2147483647 then raise exception 'referral_payout_overflow';end if;
 if due>0 then insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(parent,due::integer,'referral_reward','Реферальные награды') returning id into tx;end if;
 update public.rewards_referral_wallets set remainder_hundredths=total%100,paid_coins=paid_coins+due where user_id=parent;
 update public.rewards_referral_events set settled_at=now(),settlement_id=tx where id=any(ids);n:=n+1;
 end loop;return n;end $$;
create function public.rewards_referral_state(p_user uuid,p_page integer default 1) returns jsonb language plpgsql security invoker set search_path='' as $$
declare code text;items jsonb;history jsonb;total bigint;earned bigint;paid bigint;rate integer;begin
 if p_page<1 or p_page>1000000 then raise exception 'invalid_request';end if;
 code:=public.rewards_referral_code(p_user);
 select count(*) into total from public.rewards_referrals where referrer_user_id=p_user;
 select coalesce(sum(amount_hundredths),0) into earned from public.rewards_referral_events where referrer_user_id=p_user;
 select coalesce(paid_coins,0) into paid from public.rewards_referral_wallets where user_id=p_user;
 select case when exists(select 1 from public.rewards_streamer_live_profiles s join public.rewards_users u on u.twitch_user_id=s.broadcaster_id where u.id=p_user and s.status='approved') or exists(select 1 from public.rewards_streamers s join public.rewards_users u on u.twitch_user_id=s.twitch_broadcaster_id where u.id=p_user and s.is_primary and s.enabled) then 5 else 15 end into rate;
 select coalesce(jsonb_agg(x order by x."createdAt" desc),'[]') into items from (select u.twitch_login as login,u.twitch_display_name as name,r.created_at as "createdAt",r.eligible_earned_coins as "earnedCoins",u.steam_trade_url_valid as "tradeReady",r.qualified_at as "qualifiedAt",r.signup_bonus_coins as "bonusCoins" from public.rewards_referrals r join public.rewards_users u on u.id=r.referred_user_id where r.referrer_user_id=p_user order by r.created_at desc,r.referred_user_id limit 20 offset ((p_page-1)*20))x;
 select coalesce(jsonb_agg(x order by x."createdAt" desc),'[]') into history from (select e.event_kind as kind,e.basis_coins as basis,e.amount_hundredths as hundredths,e.created_at as "createdAt",e.settled_at is not null as settled,u.twitch_display_name as name,u.twitch_login as login from public.rewards_referral_events e join public.rewards_users u on u.id=e.referred_user_id where e.referrer_user_id=p_user order by e.created_at desc,e.id limit 30)x;
 return jsonb_build_object('code',code,'bonusCoins',rate,'total',total,'qualified',(select count(*) from public.rewards_referrals where referrer_user_id=p_user and qualified_at is not null),'paidCoins',coalesce(paid,0),'earnedHundredths',earned,'remainderHundredths',earned%100,'pendingCoins',earned/100-coalesce(paid,0),'page',p_page,'pages',greatest(1,(total+19)/20),'items',items,'history',history);
end $$;
-- All new objects are internal to the trusted server; no browser RPC access.
revoke all on function public.rewards_sell_win(uuid,uuid),public.rewards_qualify_referral(uuid),public.rewards_referral_same_steam(uuid,uuid),public.rewards_referral_code(uuid),public.rewards_referral_bind(uuid,text),public.rewards_referral_coin_event(),public.rewards_referral_trade_event(),public.rewards_referral_record(uuid,text,uuid,bigint),public.rewards_referral_order_snapshot(),public.rewards_referral_order_event(),public.rewards_referral_win_delivery(),public.rewards_referral_upgrade_event(),public.rewards_referral_settle(integer),public.rewards_referral_state(uuid,integer) from public,anon,authenticated;
grant execute on function public.rewards_sell_win(uuid,uuid),public.rewards_qualify_referral(uuid),public.rewards_referral_same_steam(uuid,uuid),public.rewards_referral_code(uuid),public.rewards_referral_bind(uuid,text),public.rewards_referral_coin_event(),public.rewards_referral_trade_event(),public.rewards_referral_record(uuid,text,uuid,bigint),public.rewards_referral_order_snapshot(),public.rewards_referral_order_event(),public.rewards_referral_win_delivery(),public.rewards_referral_upgrade_event(),public.rewards_referral_settle(integer),public.rewards_referral_state(uuid,integer) to service_role;
