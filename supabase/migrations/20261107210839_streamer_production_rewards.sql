-- Production partner drops: independent empty wallet, shared viewer accounts/inventory.
-- Test ledgers and awards are deliberately not copied.
create table public.rewards_streamer_live_control(id boolean primary key default true check(id),enabled boolean not null default false,test_only boolean not null default false check(not test_only));
insert into public.rewards_streamer_live_control(id) values(true);
create table public.rewards_streamer_live_profiles(
 broadcaster_id text primary key check(broadcaster_id in ('511100980','39780903')),
 name text not null check(length(name) between 1 and 80),login text not null check(login ~ '^[a-z0-9_]{1,25}$'),url text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','suspended')),
 decided_by text,decided_at timestamptz,created_at timestamptz not null default clock_timestamp(),obs_hash text unique check(obs_hash is null or obs_hash ~ '^[a-f0-9]{64}$')
);
create table public.rewards_streamer_live_rounds(
 id uuid primary key,broadcaster_id text not null references public.rewards_streamer_live_profiles(broadcaster_id),
 mode text not null check(mode in('time','messages')),seconds integer not null check(seconds between 1 and 3600),threshold integer not null check(threshold between 5 and 5000),
 min_price integer not null check(min_price>=2),max_price integer not null check(max_price<=3000 and max_price>=min_price),
 prize_id uuid not null references public.rewards_prizes(id),prize_name text not null,cost integer not null check(cost between 1 and 3000),
 status text not null default 'active' check(status in('active','completed','cancelled')),message_count integer not null default 0,
 started_at timestamptz not null default clock_timestamp(),finished_at timestamptz,winner uuid references public.rewards_users(id),winner_name text
);
create unique index rewards_streamer_live_one_active on public.rewards_streamer_live_rounds(broadcaster_id) where status='active';
create index rewards_streamer_live_round_history on public.rewards_streamer_live_rounds(broadcaster_id,started_at desc);
create table public.rewards_streamer_live_participants(round_id uuid references public.rewards_streamer_live_rounds(id),user_id uuid references public.rewards_users(id),primary key(round_id,user_id));
create table public.rewards_streamer_live_events(broadcaster_id text not null,message_id text not null,created_at timestamptz not null default clock_timestamp(),primary key(broadcaster_id,message_id));
create table public.rewards_streamer_live_promos(id uuid primary key,broadcaster_id text not null references public.rewards_streamer_live_profiles(broadcaster_id),code text not null unique check(code ~ '^STR-[A-Z0-9_-]{3,24}$'),prize_id uuid references public.rewards_prizes(id),prize_name text not null,reward_type text not null default 'prize' check(reward_type in('prize','coins')),cost integer not null check(cost between 1 and 3000),check((reward_type='coins' and prize_id is null) or (reward_type='prize' and prize_id is not null)),max_uses integer not null check(max_uses between 1 and 1000),used integer not null default 0 check(used>=0 and used<=max_uses),active boolean not null default true,expires_at timestamptz not null,created_at timestamptz not null default clock_timestamp());
create index rewards_streamer_live_promo_owner on public.rewards_streamer_live_promos(broadcaster_id,created_at desc);
create table public.rewards_streamer_live_ledger(id uuid primary key default gen_random_uuid(),broadcaster_id text not null references public.rewards_streamer_live_profiles(broadcaster_id),amount bigint not null check(amount<>0),kind text not null check(kind in('topup','reserve','refund')),request_id uuid not null,actor text not null,created_at timestamptz not null default clock_timestamp(),unique(broadcaster_id,request_id,kind));
create index rewards_streamer_live_ledger_owner on public.rewards_streamer_live_ledger(broadcaster_id,created_at desc);
create table public.rewards_streamer_live_awards(id uuid primary key default gen_random_uuid(),broadcaster_id text not null references public.rewards_streamer_live_profiles(broadcaster_id),user_id uuid not null references public.rewards_users(id),prize_name text not null,cost integer not null,round_id uuid unique references public.rewards_streamer_live_rounds(id),promo_id uuid references public.rewards_streamer_live_promos(id),win_id uuid unique references public.rewards_wins(id),coin_transaction_id uuid unique references public.rewards_coin_transactions(id),created_at timestamptz not null default clock_timestamp(),check((round_id is not null)::integer+(promo_id is not null)::integer=1),check((win_id is not null)::integer+(coin_transaction_id is not null)::integer=1),unique(promo_id,user_id));
create index rewards_streamer_live_award_owner on public.rewards_streamer_live_awards(broadcaster_id,created_at desc);
create index rewards_streamer_live_award_user on public.rewards_streamer_live_awards(user_id,created_at desc);
create table public.rewards_streamer_live_audit(id uuid primary key default gen_random_uuid(),actor text not null,action text not null,target text,created_at timestamptz not null default clock_timestamp());
-- Service-only API. Twitch identity is supplied exclusively by the signed server session.
create function public.rewards_streamer_live_deliver(p_broadcaster text,p_user uuid,p_prize uuid,p_name text,p_cost integer,p_round uuid,p_promo uuid) returns void language plpgsql security invoker set search_path='' as $$
declare wid uuid;cid uuid;
begin
 if p_prize is null then
  insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user,p_cost,'adjustment','Промокод стримера '||p_broadcaster) returning id into cid;
 else
  insert into public.rewards_wins(user_id,prize_id,source_type) values(p_user,p_prize,'streamer') returning id into wid;
 end if;
 insert into public.rewards_streamer_live_awards(broadcaster_id,user_id,prize_name,cost,round_id,promo_id,win_id,coin_transaction_id) values(p_broadcaster,p_user,p_name,p_cost,p_round,p_promo,wid,cid);
 if p_round is not null then
  perform public.rewards_season_add_task_progress(p_user,'drop_win',1,1,100,public.rewards_s1_day(),true);
  perform public.rewards_season_add_task_progress(p_user,'drops_10',1,12,600,public.rewards_s1_week(),false);
  perform public.rewards_award_xp(p_user,20,'Победа в розыгрыше','giveaway_win',wid::text);
  insert into public.rewards_push_jobs(subscription_id,win_id,payload)
  select s.id,wid,jsonb_build_object('title','Тебе выпал дроп!','body',p_name||' — открой инвентарь.','url','/account','tag','drop-'||wid::text)
  from public.rewards_push_subscriptions s join public.rewards_device_sessions d on d.token_hash=s.device_token_hash
  where s.user_id=p_user and d.expires_at>now() and d.hard_expires_at>now() on conflict(subscription_id,win_id) do nothing;
 end if;
end $$;
create function public.rewards_streamer_live_finish(p_round uuid,p_cancel boolean default false) returns void language plpgsql security invoker set search_path='' as $$
declare r public.rewards_streamer_live_rounds; w public.rewards_users; n integer;
begin
 select * into r from public.rewards_streamer_live_rounds where id=p_round for update;
 if not found or r.status<>'active' then return;end if;
 if not p_cancel then
  select count(*) into n from public.rewards_streamer_live_participants p join public.rewards_users u on u.id=p.user_id where p.round_id=r.id and not u.banned and not u.participation_restricted and u.steam_trade_url_valid;
  if n>0 then select u.* into w from public.rewards_streamer_live_participants p join public.rewards_users u on u.id=p.user_id where p.round_id=r.id and not u.banned and not u.participation_restricted and u.steam_trade_url_valid order by u.id offset public.rewards_crypto_index(n) limit 1;end if;
 end if;
 if w.id is null then insert into public.rewards_streamer_live_ledger(broadcaster_id,amount,kind,request_id,actor) values(r.broadcaster_id,r.cost,'refund',r.id,'system') on conflict do nothing;
 else perform public.rewards_streamer_live_deliver(r.broadcaster_id,w.id,r.prize_id,r.prize_name,r.cost,r.id,null);end if;
 update public.rewards_streamer_live_rounds set status=case when p_cancel then 'cancelled' else 'completed' end,finished_at=clock_timestamp(),winner=w.id,winner_name=w.twitch_display_name where id=r.id;
end $$;
create function public.rewards_streamer_live_expire(p_broadcaster text) returns void language plpgsql security invoker set search_path='' as $$
declare r public.rewards_streamer_live_rounds;p public.rewards_streamer_live_promos;
begin
 for r in select * from public.rewards_streamer_live_rounds where broadcaster_id=p_broadcaster and status='active' and mode='time' and started_at+seconds*interval '1 second'<=clock_timestamp() for update loop perform public.rewards_streamer_live_finish(r.id);end loop;
 for p in select * from public.rewards_streamer_live_promos where broadcaster_id=p_broadcaster and active and expires_at<=clock_timestamp() for update loop
  if p.used<p.max_uses then insert into public.rewards_streamer_live_ledger(broadcaster_id,amount,kind,request_id,actor) values(p_broadcaster,(p.max_uses-p.used)*p.cost,'refund',p.id,'system') on conflict do nothing;end if;
  update public.rewards_streamer_live_promos set active=false where id=p.id;
 end loop;
end $$;
create function public.rewards_streamer_live_api(p_actor text,p_action text,p_body jsonb default '{}'::jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.rewards_streamer_live_profiles;t public.rewards_streamer_live_profiles;u public.rewards_users;r public.rewards_streamer_live_rounds;pr public.rewards_prizes;p public.rewards_streamer_live_promos;enabled boolean;owner boolean;bal bigint;amount bigint;rid uuid;target text;result jsonb;code text;ts timestamptz;reward text;unit_cost integer;
begin
 select exists(select 1 from public.rewards_streamers where is_primary and twitch_broadcaster_id=p_actor) into owner;
 if p_action='switch' then
  if not owner then raise exception 'owner_required';end if;
  -- Global lock serializes enable/disable against in-flight real awards.
  perform 1 from public.rewards_streamer_live_control where id=true for update;
  update public.rewards_streamer_live_control set enabled=(p_body->>'enabled')::boolean where id=true;
  if not (p_body->>'enabled')::boolean then
   for s in select * from public.rewards_streamer_live_profiles order by broadcaster_id for update loop
    for r in select * from public.rewards_streamer_live_rounds where broadcaster_id=s.broadcaster_id and status='active' for update loop perform public.rewards_streamer_live_finish(r.id,true);end loop;
    for p in select * from public.rewards_streamer_live_promos where broadcaster_id=s.broadcaster_id and active for update loop
     if p.used<p.max_uses then insert into public.rewards_streamer_live_ledger(broadcaster_id,amount,kind,request_id,actor) values(s.broadcaster_id,(p.max_uses-p.used)*p.cost,'refund',p.id,p_actor) on conflict do nothing;end if;update public.rewards_streamer_live_promos set active=false where id=p.id;
    end loop;
   end loop;
  end if;
  insert into public.rewards_streamer_live_audit(actor,action) values(p_actor,'switch:'||(p_body->>'enabled'));return jsonb_build_object('ok',true,'testOnly',false);
 end if;
 select c.enabled into enabled from public.rewards_streamer_live_control c where id=true for share;
 if p_action='admin' then
  if not owner then raise exception 'owner_required';end if;
  return jsonb_build_object('enabled',enabled,'testOnly',false,'profiles',coalesce((select jsonb_agg(to_jsonb(a)-'obs_hash'||jsonb_build_object('balance',coalesce((select sum(l.amount) from public.rewards_streamer_live_ledger l where l.broadcaster_id=a.broadcaster_id),0))) from public.rewards_streamer_live_profiles a),'[]'::jsonb),'ledger',coalesce((select jsonb_agg(x) from (select l.broadcaster_id,l.amount,l.kind,l.actor,l.created_at from public.rewards_streamer_live_ledger l order by l.created_at desc,l.id desc limit 100)x),'[]'::jsonb));
 end if;
 if p_action='apply' then
  if p_actor not in('511100980','39780903') then raise exception 'pilot_invite_only';end if;
  select * into u from public.rewards_users where twitch_user_id=p_actor and not banned;
  if not found then raise exception 'user_required';end if;
  if length(trim(coalesce(p_body->>'name','')))<1 or length(p_body->>'name')>80 or lower(p_body->>'login')<>lower(u.twitch_login) or lower(p_body->>'url')<>'https://www.twitch.tv/'||lower(u.twitch_login) then raise exception 'invalid_application';end if;
  insert into public.rewards_streamer_live_profiles(broadcaster_id,name,login,url) values(p_actor,trim(p_body->>'name'),lower(u.twitch_login),lower(p_body->>'url')) on conflict(broadcaster_id) do nothing;
  return jsonb_build_object('ok',true);
 end if;
 if p_action in('approve','reject','suspend','topup') then
  if not owner then raise exception 'owner_required';end if;target:=p_body->>'broadcaster';
 else target:=p_actor;end if;
 select * into s from public.rewards_streamer_live_profiles where broadcaster_id=target for update;
 if not found then
  if p_action='state' then return jsonb_build_object('profile',null,'enabled',enabled,'testOnly',false);end if;
  raise exception 'application_required';
 end if;
 if p_action in('approve','reject','suspend') then
  if p_action='approve' and s.status not in('pending','approved') then raise exception 'application_locked';end if;
  update public.rewards_streamer_live_profiles set status=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'suspended' end,decided_by=p_actor,decided_at=clock_timestamp(),obs_hash=case when p_action='approve' then obs_hash else null end where broadcaster_id=target;
  if p_action<>'approve' then
   for r in select * from public.rewards_streamer_live_rounds where broadcaster_id=target and status='active' for update loop perform public.rewards_streamer_live_finish(r.id,true);end loop;
   for p in select * from public.rewards_streamer_live_promos where broadcaster_id=target and active for update loop
    if p.used<p.max_uses then insert into public.rewards_streamer_live_ledger(broadcaster_id,amount,kind,request_id,actor) values(target,(p.max_uses-p.used)*p.cost,'refund',p.id,p_actor) on conflict do nothing;end if;update public.rewards_streamer_live_promos set active=false where id=p.id;
   end loop;
  end if;
  insert into public.rewards_streamer_live_audit(actor,action,target) values(p_actor,p_action,target);return jsonb_build_object('ok',true);
 end if;
 perform public.rewards_streamer_live_expire(target);
 select coalesce(sum(l.amount),0) into bal from public.rewards_streamer_live_ledger l where l.broadcaster_id=target;
 if p_action='topup' then
  amount:=(p_body->>'amount')::bigint;rid:=(p_body->>'requestId')::uuid;
  if amount is null or amount not between 1 and 1000000 then raise exception 'invalid_amount';end if;
  if exists(select 1 from public.rewards_streamer_live_ledger l where l.broadcaster_id=target and l.request_id=rid and l.kind='topup' and l.amount<> (p_body->>'amount')::bigint) then raise exception 'request_conflict';end if;
  if exists(select 1 from public.rewards_streamer_live_ledger l where l.broadcaster_id=target and l.request_id=rid and l.kind='topup') then return jsonb_build_object('ok',true,'testOnly',false);end if;
  if bal+amount>1000000000 then raise exception 'invalid_amount';end if;
  insert into public.rewards_streamer_live_ledger(broadcaster_id,amount,kind,request_id,actor) values(target,amount,'topup',rid,p_actor) on conflict do nothing;return jsonb_build_object('ok',true,'testOnly',false);
 end if;
 if p_action='state' then
  return jsonb_build_object('testOnly',false,'enabled',enabled,'profile',to_jsonb(s)-'obs_hash','balance',bal,'round',(select to_jsonb(x) from public.rewards_streamer_live_rounds x where broadcaster_id=target and status='active'),'history',coalesce((select jsonb_agg(x) from(select * from public.rewards_streamer_live_rounds where broadcaster_id=target order by started_at desc limit 20)x),'[]'::jsonb),'promos',coalesce((select jsonb_agg(x) from(select * from public.rewards_streamer_live_promos where broadcaster_id=target order by created_at desc limit 30)x),'[]'::jsonb),'catalog',coalesce((select jsonb_agg(x) from(select id,name,sell_price_coins from public.rewards_prizes where status='available' and unlimited and sell_price_coins between 2 and 3000 order by name)x),'[]'::jsonb));
 end if;
 if p_action='tick' then return jsonb_build_object('ok',true);end if;
 if not enabled then raise exception 'pilot_disabled';end if;
 if s.status<>'approved' then raise exception 'approval_required';end if;
 if p_action='obs' then
  if coalesce(p_body->>'hash','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid_request';end if;
  update public.rewards_streamer_live_profiles set obs_hash=p_body->>'hash' where broadcaster_id=target;return jsonb_build_object('ok',true);
 end if;
 if p_action='start' then
  rid:=(p_body->>'requestId')::uuid;
  select * into r from public.rewards_streamer_live_rounds where id=rid;
  if found then
   if r.broadcaster_id<>target or r.mode<>p_body->>'mode' or r.seconds<>(p_body->>'seconds')::integer or r.threshold<>(p_body->>'threshold')::integer or r.min_price<>(p_body->>'minPrice')::integer or r.max_price<>(p_body->>'maxPrice')::integer then raise exception 'request_conflict';end if;
   return jsonb_build_object('ok',true,'id',r.id);
  end if;
  if exists(select 1 from public.rewards_streamer_live_rounds where broadcaster_id=target and status='active') then raise exception 'round_active';end if;
  if coalesce(p_body->>'mode','') not in('time','messages') or coalesce((p_body->>'seconds')::integer,0) not between 1 and 3600 or coalesce((p_body->>'threshold')::integer,0) not between 5 and 5000 or coalesce((p_body->>'minPrice')::integer,0)<2 or coalesce((p_body->>'maxPrice')::integer,0)>3000 or (p_body->>'minPrice')::integer>(p_body->>'maxPrice')::integer then raise exception 'invalid_request';end if;
  select * into pr from public.rewards_prizes where status='available' and unlimited and sell_price_coins between (p_body->>'minPrice')::integer and (p_body->>'maxPrice')::integer and sell_price_coins<=bal order by id offset public.rewards_crypto_index(greatest(1,(select count(*)::integer from public.rewards_prizes where status='available' and unlimited and sell_price_coins between (p_body->>'minPrice')::integer and (p_body->>'maxPrice')::integer and sell_price_coins<=bal))) limit 1;
  if not found then raise exception 'no_affordable_prize';end if;
  insert into public.rewards_streamer_live_rounds(id,broadcaster_id,mode,seconds,threshold,min_price,max_price,prize_id,prize_name,cost) values(rid,target,p_body->>'mode',(p_body->>'seconds')::integer,(p_body->>'threshold')::integer,(p_body->>'minPrice')::integer,(p_body->>'maxPrice')::integer,pr.id,pr.name,pr.sell_price_coins);
  insert into public.rewards_streamer_live_ledger(broadcaster_id,amount,kind,request_id,actor) values(target,-pr.sell_price_coins,'reserve',rid,p_actor);return jsonb_build_object('ok',true,'id',rid);
 end if;
 if p_action='stop' then
  rid:=(p_body->>'roundId')::uuid;
  select * into r from public.rewards_streamer_live_rounds where id=rid and broadcaster_id=target for update;
  if not found then raise exception 'round_not_found';end if;
  perform public.rewards_streamer_live_finish(r.id,true);return jsonb_build_object('ok',true);
 end if;
 if p_action='promo' then
  rid:=(p_body->>'requestId')::uuid;code:=upper(p_body->>'code');ts:=(p_body->>'expiresAt')::timestamptz;
  select * into p from public.rewards_streamer_live_promos where id=rid;
  if found then
   if p.broadcaster_id<>target or p.code<>code or p.reward_type is distinct from p_body->>'rewardType' or (p.reward_type='prize' and p.prize_id is distinct from (p_body->>'prizeId')::uuid) or (p.reward_type='coins' and p.cost is distinct from (p_body->>'coinAmount')::integer) or p.max_uses<>(p_body->>'uses')::integer or p.expires_at<>ts then raise exception 'request_conflict';end if;return jsonb_build_object('ok',true);
  end if;
  if code is null or code !~ '^STR-[A-Z0-9_-]{3,24}$' or ts is null or ts<=clock_timestamp() or ts>clock_timestamp()+interval '30 days' or coalesce((p_body->>'uses')::integer,0) not between 1 and 1000 then raise exception 'invalid_request';end if;
  if exists(select 1 from public.rewards_promo_codes pc where upper(pc.code)=upper(p_body->>'code')) then raise exception 'request_conflict';end if;
  reward:=p_body->>'rewardType';
  if reward='prize' then
   select * into pr from public.rewards_prizes where id=(p_body->>'prizeId')::uuid and status='available' and unlimited and sell_price_coins between 2 and 3000;
   if not found then raise exception 'prize_unavailable';end if;unit_cost:=pr.sell_price_coins;
  elsif reward='coins' then unit_cost:=(p_body->>'coinAmount')::integer;
   if coalesce(unit_cost,0) not between 1 and 3000 then raise exception 'invalid_amount';end if;
  else raise exception 'invalid_request';end if;
  amount:=unit_cost*(p_body->>'uses')::integer;if bal<amount then raise exception 'insufficient_budget';end if;
  insert into public.rewards_streamer_live_promos(id,broadcaster_id,code,prize_id,prize_name,reward_type,cost,max_uses,expires_at) values(rid,target,code,pr.id,case when reward='coins' then unit_cost||' монет' else pr.name end,reward,unit_cost,(p_body->>'uses')::integer,ts);
  insert into public.rewards_streamer_live_ledger(broadcaster_id,amount,kind,request_id,actor) values(target,-amount,'reserve',rid,p_actor);return jsonb_build_object('ok',true);
 end if;
 if p_action='cancelPromo' then
  select * into p from public.rewards_streamer_live_promos where id=(p_body->>'promoId')::uuid and broadcaster_id=target for update;
  if not found then raise exception 'promo_not_found';end if;
  if p.active then
   if p.used<p.max_uses then insert into public.rewards_streamer_live_ledger(broadcaster_id,amount,kind,request_id,actor) values(target,(p.max_uses-p.used)*p.cost,'refund',p.id,p_actor) on conflict do nothing;end if;update public.rewards_streamer_live_promos set active=false where id=p.id;
  end if;return jsonb_build_object('ok',true);
 end if;
 raise exception 'invalid_action';
end $$;
create function public.rewards_streamer_live_chat(p_broadcaster text,p_message text,p_user text,p_occurred timestamptz) returns void language plpgsql security invoker set search_path='' as $$
declare s public.rewards_streamer_live_profiles;r public.rewards_streamer_live_rounds;u public.rewards_users;
begin
 perform 1 from public.rewards_streamer_live_control where id=true and enabled for share;if not found then return;end if;
 select * into s from public.rewards_streamer_live_profiles where broadcaster_id=p_broadcaster and status='approved' for update;if not found then return;end if;
 if length(coalesce(p_message,'')) not between 1 and 256 or p_user !~ '^[0-9]{1,30}$' or p_occurred is null then raise exception 'invalid_event';end if;
 perform public.rewards_streamer_live_expire(p_broadcaster);
 insert into public.rewards_streamer_live_events(broadcaster_id,message_id) values(p_broadcaster,p_message) on conflict do nothing;if not found then return;end if;
 select * into r from public.rewards_streamer_live_rounds where broadcaster_id=p_broadcaster and status='active' for update;
 if not found or p_user=p_broadcaster or p_occurred<r.started_at or p_occurred>clock_timestamp()+interval '1 minute' then return;end if;
 select * into u from public.rewards_users where twitch_user_id=p_user and not banned;
 if found then insert into public.rewards_streamer_live_participants(round_id,user_id) values(r.id,u.id) on conflict do nothing;end if;
 update public.rewards_streamer_live_rounds set message_count=message_count+1 where id=r.id;
 if r.mode='messages' and r.message_count+1>=r.threshold then perform public.rewards_streamer_live_finish(r.id);end if;
end $$;
create function public.rewards_streamer_live_redeem(p_actor text,p_code text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.rewards_streamer_live_promos;u public.rewards_users;s public.rewards_streamer_live_profiles;aid uuid;
begin
 perform 1 from public.rewards_streamer_live_control where id=true and enabled for share;if not found then raise exception 'pilot_disabled';end if;
 select * into u from public.rewards_users where twitch_user_id=p_actor and not banned and not participation_restricted;if not found then raise exception 'user_required';end if;
 select * into p from public.rewards_streamer_live_promos where code=upper(trim(p_code));if not found then raise exception 'promo_not_found';end if;
 if p.broadcaster_id=p_actor then raise exception 'self_reward_forbidden';end if;
 select * into s from public.rewards_streamer_live_profiles where broadcaster_id=p.broadcaster_id and status='approved' for update;if not found then raise exception 'approval_required';end if;
 perform public.rewards_streamer_live_expire(s.broadcaster_id);
 select * into p from public.rewards_streamer_live_promos where id=p.id for update;
 select id into aid from public.rewards_streamer_live_awards where promo_id=p.id and user_id=u.id;if found then return jsonb_build_object('ok',true,'testOnly',false,'alreadyUsed',true,'rewardType',p.reward_type,'amount',p.cost);end if;
 if not p.active or p.expires_at<=clock_timestamp() or p.used>=p.max_uses then raise exception 'promo_closed';end if;
 perform public.rewards_streamer_live_deliver(s.broadcaster_id,u.id,p.prize_id,p.prize_name,p.cost,null,p.id);
 update public.rewards_streamer_live_promos set used=used+1,active=(used+1<max_uses) where id=p.id;return jsonb_build_object('ok',true,'testOnly',false,'rewardType',p.reward_type,'amount',p.cost);
end $$;
create function public.rewards_streamer_live_obs(p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.rewards_streamer_live_profiles;result jsonb;
begin
 perform 1 from public.rewards_streamer_live_control where id=true and enabled for share;if not found then raise exception 'pilot_disabled';end if;
 select * into s from public.rewards_streamer_live_profiles where obs_hash=p_hash and status='approved' for update;if not found then raise exception 'invalid_obs';end if;
 perform public.rewards_streamer_live_expire(s.broadcaster_id);
 return jsonb_build_object('testOnly',false,'channel',s.login,'serverNow',clock_timestamp(),'round',(select jsonb_build_object('id',id,'mode',mode,'seconds',seconds,'threshold',threshold,'message_count',message_count,'started_at',started_at,'prize_name',prize_name) from public.rewards_streamer_live_rounds where broadcaster_id=s.broadcaster_id and status='active'),'latest',(select jsonb_build_object('id',id,'winner',winner_name,'prize',prize_name,'image',(select z.image_url from public.rewards_prizes z where z.id=prize_id),'at',finished_at) from public.rewards_streamer_live_rounds where broadcaster_id=s.broadcaster_id and status='completed' order by finished_at desc limit 1));
end $$;
do $$declare t text;f record;begin
 foreach t in array array['rewards_streamer_live_control','rewards_streamer_live_profiles','rewards_streamer_live_rounds','rewards_streamer_live_participants','rewards_streamer_live_events','rewards_streamer_live_promos','rewards_streamer_live_ledger','rewards_streamer_live_awards','rewards_streamer_live_audit'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on public.%I to service_role',t);end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'rewards_streamer_live_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;
end $$;

-- Keep approval and existing private OBS URLs; no test funds/history cross the boundary.
insert into public.rewards_streamer_live_profiles select * from public.rewards_pilot_profiles;
