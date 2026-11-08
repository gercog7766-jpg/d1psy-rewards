-- Configurable seasonal goal; retain the original five lock proportions.
alter table public.rewards_vault_seasons add column required_keys integer not null default 1300 check(required_keys between 5 and 1000000);
create function public.rewards_vault_lock_targets(p_total integer) returns integer[] language sql immutable security invoker set search_path='' as $$
 with weights as(select ord,w from (values(1,150),(2,200),(3,250),(4,300),(5,400))x(ord,w)),base as(select ord,floor(p_total::numeric*w/1300)::integer whole,(p_total::numeric*w)%1300 remainder from weights),ranked as(select *,row_number() over(order by remainder desc,ord) rn,p_total-sum(whole) over() extra from base)
 select array_agg(whole+case when rn<=extra then 1 else 0 end order by ord) from ranked
$$;
revoke all on function public.rewards_vault_lock_targets(integer) from public,anon,authenticated;
grant execute on function public.rewards_vault_lock_targets(integer) to service_role;
create unique index rewards_vault_threshold_nonce on public.rewards_vault_audit((details->>'requestId')) where action='threshold';
create or replace function public.rewards_vault_settle(p_week date) returns boolean language plpgsql security invoker set search_path='' as $$
declare s public.rewards_vault_seasons;r record;tx uuid;v_paid integer:=0;leftover integer;ok boolean;begin
 select * into s from public.rewards_vault_seasons where week=p_week;
 if s.week is null or s.settled_at is not null or public.rewards_vault_now()<s.ends_at then return false;end if;
 perform pg_advisory_xact_lock(7268021,1);select * into s from public.rewards_vault_seasons where week=p_week for update;
 if s.week is null or s.settled_at is not null or public.rewards_vault_now()<s.ends_at then return false;end if;
 ok:=s.pool>0 and s.total>=s.required_keys and s.code_solved_at is not null and s.code_solved_at<s.ends_at;
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
create or replace function public.rewards_vault_state(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.rewards_vault_seasons;w public.rewards_vault_wallets;wk date;leaders jsonb;hist jsonb;reward integer;begin
 if not exists(select 1 from public.rewards_users where id=p_user and not coalesce(banned,false)) then raise exception 'user_unavailable';end if;
 wk:=greatest('2026-11-09'::date,public.rewards_vault_week(public.rewards_vault_now()));perform public.rewards_vault_ensure(wk);perform public.rewards_vault_process(p_user,200);perform public.rewards_vault_settle(wk);
 select * into s from public.rewards_vault_seasons where week=wk;select * into w from public.rewards_vault_wallets where week=wk and user_id=p_user;
 select coalesce(jsonb_agg(x order by x.contributed desc,x.first_contributed_at),'[]') into leaders from (select u.twitch_login login,u.twitch_display_name as "displayName",a.contributed,a.first_contributed_at,a.user_id=p_user as "isMe" from public.rewards_vault_wallets a join public.rewards_users u on u.id=a.user_id where a.week=wk and a.contributed>0 order by a.contributed desc,a.first_contributed_at,a.user_id limit 25)x;
 select coalesce(jsonb_agg(x order by x.id desc),'[]') into hist from(select id,kind,amount,details,created_at from public.rewards_vault_key_ledger where week=wk and user_id=p_user order by id desc limit 50)x;
 select case when forfeited then 0 else amount end into reward from public.rewards_vault_payouts where week=wk and user_id=p_user;
 return jsonb_build_object('serverNow',public.rewards_vault_now(),'week',wk,'startsAt',s.starts_at,'endsAt',s.ends_at,'status',s.status,'pool',s.pool,'funded',s.pool>0,'keyCap',s.key_cap,'total',s.total,'threshold',s.required_keys,'locks',to_jsonb(public.rewards_vault_lock_targets(s.required_keys)),'codeSolved',s.code_solved_at is not null,'codeEntry',s.code_entry,'hasCode',s.code_hash is not null,'closed',s.settled_at is not null,'paid',s.paid,'balance',coalesce(w.balance,0),'earned',coalesce(w.earned,0),'contributed',coalesce(w.contributed,0),'remainingCap',greatest(0,s.key_cap-coalesce(w.earned,0)),'reward',coalesce(reward,0),'leaders',leaders,'history',hist);
end$$;
create or replace function public.rewards_vault_code(p_user uuid,p_week date,p_request uuid,p_digest text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.rewards_vault_seasons;a public.rewards_vault_code_attempts;accepted boolean;begin
 perform pg_advisory_xact_lock(7268021,1);
 if p_request is null or p_digest is null or p_digest!~'^[a-f0-9]{64}$' then raise exception 'invalid_request';end if;
 if not exists(select 1 from public.rewards_users where id=p_user and not coalesce(banned,false)) then raise exception 'user_unavailable';end if;
 select * into s from public.rewards_vault_seasons where week=p_week for update;
 if s.week is null or s.status<>'scheduled' or s.pool<=0 or public.rewards_vault_now()<s.starts_at or public.rewards_vault_now()>=s.ends_at then raise exception 'event_closed';end if;
 if s.code_solved_at is not null then return jsonb_build_object('accepted',true,'alreadySolved',true);end if;
 if s.total<s.required_keys or not s.code_entry or s.code_hash is null then raise exception 'code_locked';end if;
 if not exists(select 1 from public.rewards_vault_wallets where week=p_week and user_id=p_user and contributed>0) then raise exception 'contribution_required';end if;
 select * into a from public.rewards_vault_code_attempts where week=p_week and user_id=p_user and request_id=p_request;
 if found then if a.digest<>p_digest then raise exception 'request_conflict';end if;return jsonb_build_object('accepted',a.accepted);end if;
 if (select count(*) from public.rewards_vault_code_attempts where week=p_week and user_id=p_user and created_at>public.rewards_vault_now()-interval '10 minutes')>=5 then raise exception 'code_rate_limited';end if;
 accepted:=s.code_hash=p_digest;
 insert into public.rewards_vault_code_attempts values(p_week,p_user,p_request,p_digest,accepted,public.rewards_vault_now());
 if accepted then update public.rewards_vault_seasons set code_solved_at=public.rewards_vault_now(),code_solved_by=p_user where week=p_week;insert into public.rewards_vault_audit(actor,action,week) values(p_user::text,'code_solved',p_week);end if;
 return jsonb_build_object('accepted',accepted);
end$$;
create or replace function public.rewards_vault_admin(p_actor text,p_action text,p_body jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.rewards_vault_seasons;wk date;v_pool integer;v_cap integer;delta integer;rid text;seasons jsonb;members jsonb;history jsonb;prior public.rewards_vault_audit;v_required integer;begin
 if not exists(select 1 from public.rewards_admins where twitch_user_id=p_actor) then raise exception 'admin_required';end if;
 perform pg_advisory_xact_lock(7268021,1);
 if p_action='threshold' then
  rid:=p_body->>'requestId';if rid is null or rid!~'^[a-f0-9-]{36}$' then raise exception 'invalid_request';end if;
  select * into prior from public.rewards_vault_audit where action='threshold' and details->>'requestId'=rid;
  if found then if prior.actor<>p_actor or (prior.details-'previousKeys')<>p_body then raise exception 'request_conflict';end if;return jsonb_build_object('ok',true);end if;
 end if;
 if p_action='state' then
  perform public.rewards_vault_tick();wk:=coalesce(nullif(p_body->>'week','')::date,greatest('2026-11-09'::date,public.rewards_vault_week(public.rewards_vault_now())));
  select coalesce(jsonb_agg(x order by x.week desc),'[]') into seasons from(select week,starts_at,ends_at,pool,key_cap,required_keys,to_jsonb(public.rewards_vault_lock_targets(required_keys)) locks,total,code_hash is not null as "hasCode",code_entry,code_solved_at,status,settled_at,paid,refunded from public.rewards_vault_seasons order by week desc limit 12)x;
  select coalesce(jsonb_agg(x),'[]') into members from(select u.twitch_login login,u.twitch_display_name as "displayName",w.user_id,w.earned,w.balance,w.contributed,w.expired,greatest(0,season.key_cap-w.earned) as remaining,(select coalesce(jsonb_object_agg(a.kind,a.n),'{}') from(select l.kind,sum(l.amount) n from public.rewards_vault_key_ledger l where l.week=wk and l.user_id=w.user_id and l.amount>0 group by l.kind)a) sources,coalesce(p.amount,0) reward,coalesce(p.forfeited,false) forfeited from public.rewards_vault_wallets w join public.rewards_users u on u.id=w.user_id join public.rewards_vault_seasons season on season.week=w.week left join public.rewards_vault_payouts p on p.week=w.week and p.user_id=w.user_id where w.week=wk and (coalesce(p_body->>'search','')='' or u.twitch_login ilike '%'||(p_body->>'search')||'%') order by w.contributed desc,w.earned desc,w.user_id limit 100 offset greatest(0,coalesce((p_body->>'offset')::integer,0)))x;
  select coalesce(jsonb_agg(x order by x.created_at desc,x.id desc),'[]') into history from(select id,week,kind,amount,request_key,actor,created_at from public.rewards_vault_funds order by created_at desc,id desc limit 50)x;
  return jsonb_build_object('serverNow',public.rewards_vault_now(),'week',wk,'availableFunds',public.rewards_vault_available(),'seasons',seasons,'members',members,'memberCount',(select count(*) from public.rewards_vault_wallets w join public.rewards_users u on u.id=w.user_id where w.week=wk and (coalesce(p_body->>'search','')='' or u.twitch_login ilike '%'||(p_body->>'search')||'%')),'streamHealth',(select jsonb_build_object('lastCheck',last_stream_check,'error',stream_error,'subscriptionsCheckedAt',subscriptions_checked_at) from public.rewards_vault_runtime where id),'fundHistory',history,'pendingSources',(select count(*) from public.rewards_vault_sources where processed_at is null),'lastStreamSync',(select max(last_seen_at) from public.rewards_vault_streams));
 end if;
 wk:=nullif(p_body->>'week','')::date;
 if p_action='topup' then
  v_pool:=(p_body->>'amount')::integer;rid:=p_body->>'requestId';if v_pool is null or v_pool not between 1 and 1000000 or rid is null or rid!~'^[a-f0-9-]{36}$' then raise exception 'invalid_request';end if;
  if exists(select 1 from public.rewards_vault_funds where request_key='admin-topup:'||rid and (amount<>v_pool or actor<>p_actor)) then raise exception 'request_conflict';end if;
  insert into public.rewards_vault_funds(kind,amount,request_key,actor) values('topup',v_pool,'admin-topup:'||rid,p_actor) on conflict(request_key) do nothing;
 elsif p_action in('prepare','code','entry','threshold') then
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
  elsif p_action='threshold' then
   v_required:=(p_body->>'requiredKeys')::integer;
   if v_required is null or v_required not between 5 and 1000000 then raise exception 'invalid_request';end if;
   if s.code_solved_at is not null then raise exception 'season_locked';end if;
   p_body:=p_body||jsonb_build_object('previousKeys',s.required_keys);
   update public.rewards_vault_seasons set required_keys=v_required,code_entry=case when v_required<>s.required_keys then false else code_entry end where week=wk;
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
