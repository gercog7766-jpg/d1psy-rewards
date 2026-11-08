-- THE VAULT: isolated keys, reserved treasury and deterministic weekly settlement.
create function public.rewards_vault_now() returns timestamptz language sql volatile security invoker set search_path='' as $$select clock_timestamp()$$;
create function public.rewards_vault_week(p_at timestamptz) returns date language sql immutable security invoker set search_path='' as $$select date_trunc('week',p_at at time zone 'Europe/Moscow')::date$$;
create table public.rewards_vault_settings(id boolean primary key default true check(id),first_week date not null default '2026-11-09',default_pool integer not null default 1500 check(default_pool between 1 and 1000000),default_cap integer not null default 50 check(default_cap between 1 and 10000),auto_reserve boolean not null default true);
insert into public.rewards_vault_settings(id) values(true);
create table public.rewards_vault_seasons(week date primary key check(extract(isodow from week)=1),starts_at timestamptz not null,ends_at timestamptz not null,pool integer not null default 0 check(pool>=0),key_cap integer not null check(key_cap between 1 and 10000),total bigint not null default 0 check(total>=0),code_hash text check(code_hash~'^[a-f0-9]{64}$'),code_entry boolean not null default false,code_solved_at timestamptz,code_solved_by uuid references public.rewards_users(id),status text not null default 'scheduled' check(status in('scheduled','success','failed')),settled_at timestamptz,paid integer not null default 0,refunded integer not null default 0,check(ends_at>starts_at),check(paid>=0 and refunded>=0 and paid+refunded<=pool));
create table public.rewards_vault_funds(id uuid primary key default gen_random_uuid(),week date references public.rewards_vault_seasons(week),kind text not null check(kind in('topup','reserve','refund','payout')),amount integer not null check(amount>0),request_key text not null unique,actor text not null,created_at timestamptz not null default clock_timestamp());
create table public.rewards_vault_wallets(week date not null references public.rewards_vault_seasons(week),user_id uuid not null references public.rewards_users(id),earned integer not null default 0 check(earned>=0),balance integer not null default 0 check(balance>=0),contributed integer not null default 0 check(contributed>=0),expired integer not null default 0 check(expired>=0),first_contributed_at timestamptz,primary key(week,user_id),check(earned=balance+contributed+expired));
create table public.rewards_vault_sources(id bigint generated always as identity primary key,user_id uuid not null references public.rewards_users(id),kind text not null check(kind in('game_day','mission','stream_win','promo')),event_key text not null,occurred_at timestamptz not null,details jsonb not null default '{}',processed_at timestamptz,week date references public.rewards_vault_seasons(week),awarded integer check(awarded in(0,1)),reason text,unique(user_id,kind,event_key));
create index rewards_vault_pending_owner on public.rewards_vault_sources(user_id,occurred_at,id) where processed_at is null;
create index rewards_vault_pending on public.rewards_vault_sources(occurred_at,id) where processed_at is null;
create table public.rewards_vault_key_ledger(id bigint generated always as identity primary key,week date not null references public.rewards_vault_seasons(week),user_id uuid not null references public.rewards_users(id),amount integer not null,kind text not null check(kind in('game_day','mission','stream_win','promo','contribution','expiry')),event_key text not null,details jsonb not null default '{}',created_at timestamptz not null default clock_timestamp(),unique(week,user_id,kind,event_key));
create index rewards_vault_key_owner on public.rewards_vault_key_ledger(week,user_id,id desc);
create table public.rewards_vault_contributions(request_id uuid primary key,user_id uuid not null references public.rewards_users(id),week date not null references public.rewards_vault_seasons(week),amount integer not null check(amount>0),created_at timestamptz not null default clock_timestamp());
create table public.rewards_vault_code_attempts(week date not null references public.rewards_vault_seasons(week),user_id uuid not null references public.rewards_users(id),request_id uuid not null,digest text not null,accepted boolean not null,created_at timestamptz not null default clock_timestamp(),primary key(week,user_id,request_id));
create index rewards_vault_attempt_limit on public.rewards_vault_code_attempts(week,user_id,created_at desc);
create table public.rewards_vault_payouts(week date not null references public.rewards_vault_seasons(week),user_id uuid not null references public.rewards_users(id),contributed integer not null,denominator bigint not null,amount integer not null check(amount>=0),forfeited boolean not null default false,transaction_id uuid unique references public.rewards_coin_transactions(id),primary key(week,user_id));
create table public.rewards_vault_audit(id bigint generated always as identity primary key,actor text not null,action text not null,week date,details jsonb not null default '{}',created_at timestamptz not null default clock_timestamp());
create table public.rewards_vault_streams(broadcaster text not null,stream_id text not null,started_at timestamptz not null,last_seen_at timestamptz not null,ended_at timestamptz,primary key(broadcaster,stream_id));
create table public.rewards_vault_runtime(id boolean primary key default true check(id),last_stream_check timestamptz,stream_error text,subscriptions_checked_at timestamptz);
create index rewards_vault_stream_range on public.rewards_vault_streams(broadcaster,started_at desc);
create function public.rewards_vault_available() returns bigint language sql stable security invoker set search_path='' as $$select coalesce(sum(case when kind in('topup','refund') then amount when kind='reserve' then -amount else 0 end),0) from public.rewards_vault_funds$$;
create function public.rewards_vault_ensure(p_week date) returns void language plpgsql security invoker set search_path='' as $$
declare cfg public.rewards_vault_settings;s public.rewards_vault_seasons;begin
 select * into cfg from public.rewards_vault_settings where id;
 select * into s from public.rewards_vault_seasons where week=p_week;
 if found and (s.pool>0 or s.status<>'scheduled' or s.ends_at<=public.rewards_vault_now() or not cfg.auto_reserve or public.rewards_vault_available()<cfg.default_pool) then return;end if;
 perform pg_advisory_xact_lock(7268021,1);
 if p_week<cfg.first_week or extract(isodow from p_week)<>1 then return;end if;
 insert into public.rewards_vault_seasons(week,starts_at,ends_at,key_cap) values(p_week,p_week::timestamp at time zone 'Europe/Moscow',(p_week::timestamp+interval '6 days 20 hours') at time zone 'Europe/Moscow',cfg.default_cap) on conflict do nothing;
 select * into s from public.rewards_vault_seasons where week=p_week for update;
 if s.pool=0 and s.status='scheduled' and s.ends_at>public.rewards_vault_now() and cfg.auto_reserve and public.rewards_vault_available()>=cfg.default_pool then
  update public.rewards_vault_seasons set pool=cfg.default_pool where week=p_week;
  insert into public.rewards_vault_funds(week,kind,amount,request_key,actor) values(p_week,'reserve',cfg.default_pool,'auto-reserve:'||p_week,'system');
 end if;
end$$;
create function public.rewards_vault_enqueue(p_user uuid,p_kind text,p_key text,p_at timestamptz,p_details jsonb default '{}') returns void language plpgsql security invoker set search_path='' as $$
declare w date;begin
 if p_user is null or p_at is null or p_at>public.rewards_vault_now()+interval '5 seconds' then return;end if;w:=public.rewards_vault_week(p_at);
 if w<'2026-11-09' or p_at>=((w::timestamp+interval '6 days 20 hours') at time zone 'Europe/Moscow') then return;end if;
 -- Never wait on another game transaction's daily deduplication key. Recovery scans cover a skipped enqueue.
 if not pg_try_advisory_xact_lock(7268022,hashtext(p_user::text||':'||p_kind||':'||p_key)) then return;end if;
 insert into public.rewards_vault_sources(user_id,kind,event_key,occurred_at,details) values(p_user,p_kind,p_key,p_at,coalesce(p_details,'{}')) on conflict(user_id,kind,event_key) do nothing;
end$$;
create function public.rewards_vault_process(p_user uuid default null,p_limit integer default 500) returns integer language plpgsql security invoker set search_path='' as $$
declare e public.rewards_vault_sources;s public.rewards_vault_seasons;w public.rewards_vault_wallets;n integer:=0;v_reason text;v_amount integer;wk date;begin
 if p_limit not between 1 and 1000 then raise exception 'invalid_request';end if;
 for e in select * from public.rewards_vault_sources where processed_at is null and (p_user is null or user_id=p_user) order by occurred_at,id limit p_limit for update skip locked loop
  wk:=public.rewards_vault_week(e.occurred_at);select * into s from public.rewards_vault_seasons where week=wk;
  if s.week is null then continue;end if;
  if s.status<>'scheduled' or public.rewards_vault_now()>=s.ends_at then update public.rewards_vault_sources set processed_at=public.rewards_vault_now(),week=wk,awarded=0,reason='expired' where id=e.id;continue;end if;
  if public.rewards_vault_now()<s.starts_at or s.pool<=0 then continue;end if;
  insert into public.rewards_vault_wallets(week,user_id) values(wk,e.user_id) on conflict do nothing;
  select * into w from public.rewards_vault_wallets where week=wk and user_id=e.user_id for update;
  v_reason:='earned';v_amount:=1;
  if public.rewards_vault_now()>=s.ends_at then v_reason:='expired';v_amount:=0;
  elsif not exists(select 1 from public.rewards_users where id=e.user_id and not coalesce(banned,false)) then v_reason:='user_unavailable';v_amount:=0;
  elsif w.earned>=s.key_cap then v_reason:='season_cap';v_amount:=0;
  elsif e.kind='promo' and (select count(*) from public.rewards_vault_key_ledger where week=wk and user_id=e.user_id and kind='promo' and amount=1)>=10 then v_reason:='promo_cap';v_amount:=0;end if;
  insert into public.rewards_vault_key_ledger(week,user_id,amount,kind,event_key,details) values(wk,e.user_id,v_amount,e.kind,e.event_key,e.details||jsonb_build_object('reason',v_reason));
  update public.rewards_vault_wallets set earned=earned+v_amount,balance=balance+v_amount where week=wk and user_id=e.user_id;
  update public.rewards_vault_sources set processed_at=public.rewards_vault_now(),week=wk,awarded=v_amount,reason=v_reason where id=e.id;n:=n+v_amount;
 end loop;return n;
end$$;
create function public.rewards_vault_settle(p_week date) returns boolean language plpgsql security invoker set search_path='' as $$
declare s public.rewards_vault_seasons;r record;tx uuid;v_paid integer:=0;leftover integer;ok boolean;begin
 select * into s from public.rewards_vault_seasons where week=p_week;
 if s.week is null or s.settled_at is not null or public.rewards_vault_now()<s.ends_at then return false;end if;
 perform pg_advisory_xact_lock(7268021,1);select * into s from public.rewards_vault_seasons where week=p_week for update;
 if s.week is null or s.settled_at is not null or public.rewards_vault_now()<s.ends_at then return false;end if;
 ok:=s.pool>0 and s.total>=1300 and s.code_solved_at is not null and s.code_solved_at<s.ends_at;
 if ok then
  -- Hamilton apportionment: whole coins; deterministic tie by first contribution, never a leaderboard bonus.
  insert into public.rewards_vault_payouts(week,user_id,contributed,denominator,amount,forfeited)
  with base as(select w.*,floor(s.pool::numeric*w.contributed/s.total)::integer whole,(s.pool::numeric*w.contributed)%s.total rem from public.rewards_vault_wallets w where w.week=p_week and w.contributed>0),ranked as(select b.*,row_number() over(order by rem desc,first_contributed_at,user_id) rn,s.pool-sum(whole) over() extra from base b)
  select p_week,b.user_id,b.contributed,s.total,b.whole+case when b.rn<=b.extra then 1 else 0 end,coalesce(u.banned,false) from ranked b join public.rewards_users u on u.id=b.user_id;
  for r in select * from public.rewards_vault_payouts where week=p_week order by user_id loop
   perform 1 from public.rewards_users where id=r.user_id and not coalesce(banned,false) for update;
   if not found then update public.rewards_vault_payouts set forfeited=true where week=p_week and user_id=r.user_id;continue;end if;
   if r.amount>0 then insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(r.user_id,r.amount,'adjustment','THE VAULT · '||p_week::text||' · доля призового фонда') returning id into tx;update public.rewards_vault_payouts set transaction_id=tx where week=p_week and user_id=r.user_id;v_paid:=v_paid+r.amount;end if;
  end loop;
 end if;
 if v_paid>0 then insert into public.rewards_vault_funds(week,kind,amount,request_key,actor) values(p_week,'payout',v_paid,'payout:'||p_week,'system');end if;
 leftover:=s.pool-v_paid;if leftover>0 then insert into public.rewards_vault_funds(week,kind,amount,request_key,actor) values(p_week,'refund',leftover,'refund:'||p_week,'system');end if;
 insert into public.rewards_vault_key_ledger(week,user_id,amount,kind,event_key,details) select p_week,user_id,-balance,'expiry',p_week::text,'{}' from public.rewards_vault_wallets where week=p_week and balance>0;
 update public.rewards_vault_wallets set expired=expired+balance,balance=0 where week=p_week;
 update public.rewards_vault_seasons set status=case when ok then 'success' else 'failed' end,settled_at=public.rewards_vault_now(),paid=v_paid,refunded=leftover,code_entry=false where week=p_week;
 insert into public.rewards_vault_audit(actor,action,week,details) values('system','settled',p_week,jsonb_build_object('success',ok,'total',s.total,'paid',v_paid,'refunded',leftover));return true;
end$$;
create function public.rewards_vault_tick() returns integer language plpgsql security invoker set search_path='' as $$
declare w date;n integer;r record;begin
 perform pg_advisory_xact_lock(7268021,1);w:=greatest('2026-11-09'::date,public.rewards_vault_week(public.rewards_vault_now()));perform public.rewards_vault_ensure(w);perform public.rewards_vault_ensure(w+7);
 n:=public.rewards_vault_process(null,1000);
 for r in select week from public.rewards_vault_seasons where settled_at is null and ends_at<=public.rewards_vault_now() order by week limit 10 loop perform public.rewards_vault_settle(r.week);end loop;
 perform public.rewards_vault_ensure(w+7);return n;
end$$;
create function public.rewards_vault_state(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.rewards_vault_seasons;w public.rewards_vault_wallets;wk date;leaders jsonb;hist jsonb;reward integer;begin
 if not exists(select 1 from public.rewards_users where id=p_user and not coalesce(banned,false)) then raise exception 'user_unavailable';end if;
 wk:=greatest('2026-11-09'::date,public.rewards_vault_week(public.rewards_vault_now()));perform public.rewards_vault_ensure(wk);perform public.rewards_vault_process(p_user,200);perform public.rewards_vault_settle(wk);
 select * into s from public.rewards_vault_seasons where week=wk;select * into w from public.rewards_vault_wallets where week=wk and user_id=p_user;
 select coalesce(jsonb_agg(x order by x.contributed desc,x.first_contributed_at),'[]') into leaders from (select u.twitch_login login,u.twitch_display_name as "displayName",a.contributed,a.first_contributed_at,a.user_id=p_user as "isMe" from public.rewards_vault_wallets a join public.rewards_users u on u.id=a.user_id where a.week=wk and a.contributed>0 order by a.contributed desc,a.first_contributed_at,a.user_id limit 25)x;
 select coalesce(jsonb_agg(x order by x.id desc),'[]') into hist from(select id,kind,amount,details,created_at from public.rewards_vault_key_ledger where week=wk and user_id=p_user order by id desc limit 50)x;
 select case when forfeited then 0 else amount end into reward from public.rewards_vault_payouts where week=wk and user_id=p_user;
 return jsonb_build_object('serverNow',public.rewards_vault_now(),'week',wk,'startsAt',s.starts_at,'endsAt',s.ends_at,'status',s.status,'pool',s.pool,'funded',s.pool>0,'keyCap',s.key_cap,'total',s.total,'threshold',1300,'locks',jsonb_build_array(150,200,250,300,400),'codeSolved',s.code_solved_at is not null,'codeEntry',s.code_entry,'hasCode',s.code_hash is not null,'closed',s.settled_at is not null,'paid',s.paid,'balance',coalesce(w.balance,0),'earned',coalesce(w.earned,0),'contributed',coalesce(w.contributed,0),'remainingCap',greatest(0,s.key_cap-coalesce(w.earned,0)),'reward',coalesce(reward,0),'leaders',leaders,'history',hist);
end$$;
create function public.rewards_vault_contribute(p_user uuid,p_week date,p_request uuid,p_amount integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.rewards_vault_seasons;w public.rewards_vault_wallets;c public.rewards_vault_contributions;begin
 perform pg_advisory_xact_lock(7268021,1);
 if p_request is null or p_amount is null or p_amount<1 then raise exception 'invalid_request';end if;
 if not exists(select 1 from public.rewards_users where id=p_user and not coalesce(banned,false)) then raise exception 'user_unavailable';end if;
 select * into c from public.rewards_vault_contributions where request_id=p_request;
 if found then if c.user_id<>p_user or c.week<>p_week or c.amount<>p_amount then raise exception 'request_conflict';end if;return public.rewards_vault_state(p_user);end if;
 perform public.rewards_vault_process(p_user,200);select * into s from public.rewards_vault_seasons where week=p_week for update;
 if s.week is null or s.status<>'scheduled' or s.pool<=0 or public.rewards_vault_now()<s.starts_at or public.rewards_vault_now()>=s.ends_at then raise exception 'event_closed';end if;
 select * into w from public.rewards_vault_wallets where week=p_week and user_id=p_user for update;
 if w.user_id is null or w.balance<p_amount then raise exception 'insufficient_keys';end if;
 if public.rewards_vault_now()>=s.ends_at then raise exception 'event_closed';end if;
 update public.rewards_vault_wallets set balance=balance-p_amount,contributed=contributed+p_amount,first_contributed_at=coalesce(first_contributed_at,public.rewards_vault_now()) where week=p_week and user_id=p_user;
 update public.rewards_vault_seasons set total=total+p_amount where week=p_week;
 insert into public.rewards_vault_contributions values(p_request,p_user,p_week,p_amount,public.rewards_vault_now());
 insert into public.rewards_vault_key_ledger(week,user_id,amount,kind,event_key) values(p_week,p_user,-p_amount,'contribution',p_request::text);
 return public.rewards_vault_state(p_user);
end$$;
create function public.rewards_vault_code(p_user uuid,p_week date,p_request uuid,p_digest text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.rewards_vault_seasons;a public.rewards_vault_code_attempts;accepted boolean;begin
 perform pg_advisory_xact_lock(7268021,1);
 if p_request is null or p_digest is null or p_digest!~'^[a-f0-9]{64}$' then raise exception 'invalid_request';end if;
 if not exists(select 1 from public.rewards_users where id=p_user and not coalesce(banned,false)) then raise exception 'user_unavailable';end if;
 select * into s from public.rewards_vault_seasons where week=p_week for update;
 if s.week is null or s.status<>'scheduled' or s.pool<=0 or public.rewards_vault_now()<s.starts_at or public.rewards_vault_now()>=s.ends_at then raise exception 'event_closed';end if;
 if s.code_solved_at is not null then return jsonb_build_object('accepted',true,'alreadySolved',true);end if;
 if s.total<1300 or not s.code_entry or s.code_hash is null then raise exception 'code_locked';end if;
 if not exists(select 1 from public.rewards_vault_wallets where week=p_week and user_id=p_user and contributed>0) then raise exception 'contribution_required';end if;
 select * into a from public.rewards_vault_code_attempts where week=p_week and user_id=p_user and request_id=p_request;
 if found then if a.digest<>p_digest then raise exception 'request_conflict';end if;return jsonb_build_object('accepted',a.accepted);end if;
 if (select count(*) from public.rewards_vault_code_attempts where week=p_week and user_id=p_user and created_at>public.rewards_vault_now()-interval '10 minutes')>=5 then raise exception 'code_rate_limited';end if;
 accepted:=s.code_hash=p_digest;
 insert into public.rewards_vault_code_attempts values(p_week,p_user,p_request,p_digest,accepted,public.rewards_vault_now());
 if accepted then update public.rewards_vault_seasons set code_solved_at=public.rewards_vault_now(),code_solved_by=p_user where week=p_week;insert into public.rewards_vault_audit(actor,action,week) values(p_user::text,'code_solved',p_week);end if;
 return jsonb_build_object('accepted',accepted);
end$$;
create function public.rewards_vault_admin(p_actor text,p_action text,p_body jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.rewards_vault_seasons;wk date;v_pool integer;v_cap integer;delta integer;rid text;seasons jsonb;members jsonb;history jsonb;begin
 if not exists(select 1 from public.rewards_admins where twitch_user_id=p_actor) then raise exception 'admin_required';end if;
 perform pg_advisory_xact_lock(7268021,1);
 if p_action='state' then
  perform public.rewards_vault_tick();wk:=coalesce(nullif(p_body->>'week','')::date,greatest('2026-11-09'::date,public.rewards_vault_week(public.rewards_vault_now())));
  select coalesce(jsonb_agg(x order by x.week desc),'[]') into seasons from(select week,starts_at,ends_at,pool,key_cap,total,code_hash is not null as "hasCode",code_entry,code_solved_at,status,settled_at,paid,refunded from public.rewards_vault_seasons order by week desc limit 12)x;
  select coalesce(jsonb_agg(x),'[]') into members from(select u.twitch_login login,u.twitch_display_name as "displayName",w.user_id,w.earned,w.balance,w.contributed,w.expired,greatest(0,season.key_cap-w.earned) as remaining,(select coalesce(jsonb_object_agg(a.kind,a.n),'{}') from(select l.kind,sum(l.amount) n from public.rewards_vault_key_ledger l where l.week=wk and l.user_id=w.user_id and l.amount>0 group by l.kind)a) sources,coalesce(p.amount,0) reward,coalesce(p.forfeited,false) forfeited from public.rewards_vault_wallets w join public.rewards_users u on u.id=w.user_id join public.rewards_vault_seasons season on season.week=w.week left join public.rewards_vault_payouts p on p.week=w.week and p.user_id=w.user_id where w.week=wk and (coalesce(p_body->>'search','')='' or u.twitch_login ilike '%'||(p_body->>'search')||'%') order by w.contributed desc,w.earned desc,w.user_id limit 100 offset greatest(0,coalesce((p_body->>'offset')::integer,0)))x;
  select coalesce(jsonb_agg(x order by x.created_at desc,x.id desc),'[]') into history from(select id,week,kind,amount,request_key,actor,created_at from public.rewards_vault_funds order by created_at desc,id desc limit 50)x;
  return jsonb_build_object('serverNow',public.rewards_vault_now(),'week',wk,'availableFunds',public.rewards_vault_available(),'seasons',seasons,'members',members,'memberCount',(select count(*) from public.rewards_vault_wallets w join public.rewards_users u on u.id=w.user_id where w.week=wk and (coalesce(p_body->>'search','')='' or u.twitch_login ilike '%'||(p_body->>'search')||'%')),'streamHealth',(select jsonb_build_object('lastCheck',last_stream_check,'error',stream_error,'subscriptionsCheckedAt',subscriptions_checked_at) from public.rewards_vault_runtime where id),'fundHistory',history,'pendingSources',(select count(*) from public.rewards_vault_sources where processed_at is null),'lastStreamSync',(select max(last_seen_at) from public.rewards_vault_streams));
 end if;
 wk:=nullif(p_body->>'week','')::date;
 if p_action='topup' then
  v_pool:=(p_body->>'amount')::integer;rid:=p_body->>'requestId';if v_pool is null or v_pool not between 1 and 1000000 or rid is null or rid!~'^[a-f0-9-]{36}$' then raise exception 'invalid_request';end if;
  if exists(select 1 from public.rewards_vault_funds where request_key='admin-topup:'||rid and (amount<>v_pool or actor<>p_actor)) then raise exception 'request_conflict';end if;
  insert into public.rewards_vault_funds(kind,amount,request_key,actor) values('topup',v_pool,'admin-topup:'||rid,p_actor) on conflict(request_key) do nothing;
 elsif p_action in('prepare','code','entry') then
  if wk is null or wk<'2026-11-09' or wk>public.rewards_vault_week(public.rewards_vault_now())+35 or extract(isodow from wk)<>1 then raise exception 'invalid_request';end if;
  perform public.rewards_vault_ensure(wk);select * into s from public.rewards_vault_seasons where week=wk for update;
  if s.status<>'scheduled' or public.rewards_vault_now()>=s.ends_at then raise exception 'event_closed';end if;
  if p_action='prepare' then
   v_pool:=(p_body->>'pool')::integer;v_cap:=(p_body->>'cap')::integer;
   if v_pool is null or v_pool not between 1 and 1000000 or v_cap is null or v_cap not between 1 and 10000 then raise exception 'invalid_request';end if;
   if s.total>0 or exists(select 1 from public.rewards_vault_wallets where week=wk and earned>0) then raise exception 'season_locked';end if;
   delta:=v_pool-s.pool;if delta>public.rewards_vault_available() then raise exception 'insufficient_funds';end if;
   if delta<>0 then insert into public.rewards_vault_funds(week,kind,amount,request_key,actor) values(wk,case when delta>0 then 'reserve' else 'refund' end,abs(delta),'prepare:'||(p_body->>'requestId'),p_actor);end if;
   update public.rewards_vault_seasons set pool=v_pool,key_cap=v_cap where week=wk;
  elsif p_action='code' then
   if s.code_solved_at is not null or s.code_entry then raise exception 'season_locked';end if;
   if p_body->>'digest' is null or p_body->>'digest'!~'^[a-f0-9]{64}$' then raise exception 'invalid_request';end if;
   update public.rewards_vault_seasons set code_hash=p_body->>'digest' where week=wk;
  else
   if s.code_hash is null then raise exception 'code_not_configured';end if;
   update public.rewards_vault_seasons set code_entry=coalesce((p_body->>'enabled')::boolean,false) where week=wk;
  end if;
 else raise exception 'invalid_request';end if;
 insert into public.rewards_vault_audit(actor,action,week,details) values(p_actor,p_action,wk,p_body-'digest'-'code');return jsonb_build_object('ok',true);
end$$;
create function public.rewards_vault_capture() returns trigger language plpgsql security invoker set search_path='' as $$
declare at_time timestamptz;done boolean;before_done boolean;kind text;key text;begin
 if tg_table_name in('rewards_ms_games','rewards_defuse_games') then
  if new.status in('won','lost') and old.status not in('won','lost') then at_time:=coalesce(new.finished_at,public.rewards_vault_now());perform public.rewards_vault_enqueue(new.user_id,'game_day',(at_time at time zone 'Europe/Moscow')::date::text,at_time,jsonb_build_object('game',tg_table_name,'gameId',new.id));end if;
 elsif tg_table_name='rewards_nr_games' then
  if new.status<>'playing' and old.status='playing' and new.tick>0 then at_time:=coalesce(new.finished_at,public.rewards_vault_now());perform public.rewards_vault_enqueue(new.user_id,'game_day',(at_time at time zone 'Europe/Moscow')::date::text,at_time,jsonb_build_object('game','night-run','gameId',new.id));end if;
 elsif tg_table_name='rewards_wordly_games' then
  done:=new.answer=any(new.guesses) or cardinality(new.guesses)>=6;before_done:=old.answer=any(old.guesses) or cardinality(old.guesses)>=6;
  if done and not before_done then at_time:=coalesce(new.finished_at,public.rewards_vault_now());perform public.rewards_vault_enqueue(new.user_id,'game_day',(at_time at time zone 'Europe/Moscow')::date::text,at_time,jsonb_build_object('game','wordly','day',new.game_day));end if;
 elsif tg_table_name='rewards_ttt_rooms' then
  if new.status='finished' and old.status<>'finished' and new.guest_id is not null then
   at_time:=coalesce(new.updated_at,public.rewards_vault_now());
   perform public.rewards_vault_enqueue(new.host_id,'game_day',(at_time at time zone 'Europe/Moscow')::date::text,at_time,jsonb_build_object('game','tic-tac-toe','room',new.id));
   perform public.rewards_vault_enqueue(new.guest_id,'game_day',(at_time at time zone 'Europe/Moscow')::date::text,at_time,jsonb_build_object('game','tic-tac-toe','room',new.id));
  end if;
 elsif tg_table_name='rewards_season_task_progress' then
  if new.completed_at is not null and (tg_op='INSERT' or old.completed_at is null) and new.sp_awarded>0 and new.task_key not in('allin','sniper','closecall') then
   at_time:=new.completed_at;
   done:=(new.period_key=(at_time at time zone 'Europe/Moscow')::date::text and exists(select 1 from public.rewards_season_daily_schedule d where d.day=(at_time at time zone 'Europe/Moscow')::date and d.task_key=new.task_key)) or (new.period_key='M'||public.rewards_vault_week(at_time)::text and new.task_key in('upgrades_15','withdraw_200','upgrader_coins_200','xp_500','upgrade_30','daily_all','streak_5','drops_10','upgrade_x3','upgrade_value_3000'));
   if done then perform public.rewards_vault_enqueue(new.user_id,'mission',new.season_id||':'||new.task_key||':'||new.period_key,at_time,jsonb_build_object('task',new.task_key,'period',new.period_key));end if;
  end if;
 elsif tg_table_name='rewards_promo_redemptions' then
  if exists(select 1 from public.rewards_promo_codes where id=new.promo_id and code not like 'STR-%') then perform public.rewards_vault_enqueue(new.user_id,'promo',new.id::text,coalesce(new.created_at,public.rewards_vault_now()),jsonb_build_object('promoId',new.promo_id));end if;
 end if;return new;
end$$;
create trigger rewards_vault_ms after update on public.rewards_ms_games for each row execute function public.rewards_vault_capture();
create trigger rewards_vault_defuse after update on public.rewards_defuse_games for each row execute function public.rewards_vault_capture();
create trigger rewards_vault_nr after update on public.rewards_nr_games for each row execute function public.rewards_vault_capture();
create trigger rewards_vault_wordly after update on public.rewards_wordly_games for each row execute function public.rewards_vault_capture();
create trigger rewards_vault_ttt after update on public.rewards_ttt_rooms for each row execute function public.rewards_vault_capture();
create trigger rewards_vault_mission after insert or update on public.rewards_season_task_progress for each row execute function public.rewards_vault_capture();
create trigger rewards_vault_promo after insert on public.rewards_promo_redemptions for each row execute function public.rewards_vault_capture();
create function public.rewards_vault_stream(p_broadcaster text,p_stream text,p_started timestamptz,p_at timestamptz,p_online boolean) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_broadcaster is null or p_broadcaster!~'^[0-9]{1,30}$' or p_at is null or p_at>public.rewards_vault_now()+interval '1 minute' then raise exception 'invalid_request';end if;
 if p_online then
  if p_stream is null or p_stream!~'^[0-9]{1,40}$' or p_started is null or p_started>p_at then raise exception 'invalid_request';end if;
  update public.rewards_vault_streams set ended_at=greatest(started_at,p_started) where broadcaster=p_broadcaster and stream_id<>p_stream and ended_at is null and started_at<=p_started;
  insert into public.rewards_vault_streams(broadcaster,stream_id,started_at,last_seen_at) values(p_broadcaster,p_stream,p_started,p_at) on conflict(broadcaster,stream_id) do update set last_seen_at=greatest(public.rewards_vault_streams.last_seen_at,excluded.last_seen_at);
 else update public.rewards_vault_streams set ended_at=p_at where broadcaster=p_broadcaster and ended_at is null and started_at<=p_at and last_seen_at<=p_at;end if;
end$$;
create function public.rewards_vault_stream_wins() returns integer language plpgsql security invoker set search_path='' as $$
declare r record;n integer:=0;lo timestamptz;begin
 lo:=greatest('2026-11-09'::date,public.rewards_vault_week(public.rewards_vault_now()))::timestamp at time zone 'Europe/Moscow';
 for r in with wins as(
 select w.user_id,w.id,w.won_at at,s.twitch_broadcaster_id broadcaster from public.rewards_wins w join public.rewards_rounds rr on rr.id=w.round_id join public.rewards_streamers s on s.id=coalesce(rr.streamer_id,(select id from public.rewards_streamers where is_primary limit 1)) where w.won_at>=lo
 union all
 select a.user_id,a.win_id,a.created_at,a.broadcaster_id from public.rewards_streamer_live_awards a where a.round_id is not null and a.created_at>=lo
 ),events as(select distinct on(w.user_id,b.broadcaster,b.stream_id) w.*,b.stream_id from wins w join public.rewards_vault_streams b on b.broadcaster=w.broadcaster and w.at>=b.started_at and w.at<=coalesce(b.ended_at,b.last_seen_at+interval '90 seconds') where not exists(select 1 from public.rewards_vault_sources v where v.user_id=w.user_id and v.kind='stream_win' and v.event_key=b.broadcaster||':'||b.stream_id) order by w.user_id,b.broadcaster,b.stream_id,w.at,w.id)
 select * from events order by at limit 500 loop
  perform public.rewards_vault_enqueue(r.user_id,'stream_win',r.broadcaster||':'||r.stream_id,r.at,jsonb_build_object('broadcaster',r.broadcaster,'streamId',r.stream_id,'winId',r.id));n:=n+1;
 end loop;return n;
end$$;
create function public.rewards_vault_backfill() returns integer language plpgsql security invoker set search_path='' as $$
declare lo timestamptz;r record;n integer:=0;begin
 lo:=greatest('2026-11-09'::date,public.rewards_vault_week(public.rewards_vault_now()))::timestamp at time zone 'Europe/Moscow';
 for r in with games as(
 select user_id,finished_at at from public.rewards_ms_games where status in('won','lost') and finished_at>=lo
 union all select user_id,finished_at from public.rewards_defuse_games where status in('won','lost') and finished_at>=lo
 union all select user_id,finished_at from public.rewards_nr_games where status<>'playing' and tick>0 and finished_at>=lo
 union all select user_id,finished_at from public.rewards_wordly_games where (answer=any(guesses) or cardinality(guesses)>=6) and finished_at>=lo
 union all select host_id,updated_at from public.rewards_ttt_rooms where status='finished' and guest_id is not null and updated_at>=lo
 union all select guest_id,updated_at from public.rewards_ttt_rooms where status='finished' and guest_id is not null and updated_at>=lo
 ),candidates as(
 select user_id,'game_day'::text kind,(at at time zone 'Europe/Moscow')::date::text event_key,at,'{}'::jsonb details from games
 union all select p.user_id,'mission',p.season_id||':'||p.task_key||':'||p.period_key,p.completed_at,jsonb_build_object('task',p.task_key,'period',p.period_key) from public.rewards_season_task_progress p where p.completed_at>=lo and p.sp_awarded>0 and p.task_key not in('allin','sniper','closecall') and ((p.period_key=(p.completed_at at time zone 'Europe/Moscow')::date::text and exists(select 1 from public.rewards_season_daily_schedule d where d.day=(p.completed_at at time zone 'Europe/Moscow')::date and d.task_key=p.task_key)) or (p.period_key='M'||public.rewards_vault_week(p.completed_at)::text and p.task_key in('upgrades_15','withdraw_200','upgrader_coins_200','xp_500','upgrade_30','daily_all','streak_5','drops_10','upgrade_x3','upgrade_value_3000')))
 union all select redemption.user_id,'promo',redemption.id::text,redemption.created_at,jsonb_build_object('promoId',redemption.promo_id) from public.rewards_promo_redemptions redemption join public.rewards_promo_codes p on p.id=redemption.promo_id where redemption.created_at>=lo and p.code not like 'STR-%'
 ),pending as(select distinct on(c.user_id,c.kind,c.event_key) c.* from candidates c where c.at<=public.rewards_vault_now() and not exists(select 1 from public.rewards_vault_sources e where e.user_id=c.user_id and e.kind=c.kind and e.event_key=c.event_key) order by c.user_id,c.kind,c.event_key,c.at)
 select * from pending order by at limit 1000 loop perform public.rewards_vault_enqueue(r.user_id,r.kind,r.event_key,r.at,r.details);n:=n+1;end loop;return n;
end$$;
-- Private data only. The app supplies authenticated identities; browsers cannot write keys or funds.
do $$declare t text;f record;begin
 for t in select tablename from pg_tables where schemaname='public' and tablename like 'rewards_vault_%' loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert,update on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'rewards_vault_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end$$;
grant usage,select on sequence public.rewards_vault_sources_id_seq,public.rewards_vault_key_ledger_id_seq,public.rewards_vault_audit_id_seq to service_role;
insert into public.rewards_vault_funds(kind,amount,request_key,actor) values('topup',1500,'initial-vault-1500','system:owner-request');
select public.rewards_vault_ensure('2026-11-09');
select public.rewards_vault_ensure('2026-11-16');
do $$begin if exists(select 1 from pg_extension where extname='pg_cron') then perform cron.schedule('rewards-vault-weekly-engine','* * * * *','select public.rewards_vault_backfill();select public.rewards_vault_stream_wins();select public.rewards_vault_tick();');end if;end$$;
