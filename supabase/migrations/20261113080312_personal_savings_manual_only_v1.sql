create table public.rewards_personal_savings(
 user_id uuid primary key references public.rewards_users(id) on delete cascade,
 status text not null default 'idle' check(status in('idle','active','ready')),
 cycles_started integer not null default 0 check(cycles_started>=0),
 goal_type text check(goal_type in('amount','date')),
 goal_amount bigint,
 goal_at timestamptz,
 saved_coins bigint not null default 0 check(saved_coins>=0),
 commission_bps integer not null default 500 check(commission_bps in(350,500)),
 pig_color text not null default '#a5a5a9' check(pig_color~'^#[0-9a-fA-F]{6}$'),
 glasses_color text not null default '#25232d' check(glasses_color~'^#[0-9a-fA-F]{6}$'),
 crown_color text not null default '#c3c2c8' check(crown_color~'^#[0-9a-fA-F]{6}$'),
 started_at timestamptz,
 updated_at timestamptz not null default clock_timestamp(),
 check((status='idle' and goal_type is null and goal_amount is null and goal_at is null and saved_coins=0) or status<>'idle'),
 check(goal_amount is null or goal_amount>=500)
);
create table public.rewards_personal_savings_cycles(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.rewards_users(id),cycle_number integer not null,
 goal_type text not null check(goal_type in('amount','date')),goal_amount bigint,goal_at timestamptz,
 deposited bigint not null default 0,commission_bps integer not null check(commission_bps in(350,500)),activation_fee integer not null default 0,
 commission_paid bigint not null default 0,payout bigint not null default 0,started_at timestamptz not null,ended_at timestamptz,
 status text not null check(status in('active','broken')),unique(user_id,cycle_number)
);
create index rewards_personal_savings_cycles_recent on public.rewards_personal_savings_cycles(user_id,ended_at desc);
create table public.rewards_personal_savings_requests(request_id uuid primary key,user_id uuid not null references public.rewards_users(id),action text not null,result jsonb not null,created_at timestamptz not null default clock_timestamp());
alter table public.rewards_personal_savings enable row level security;alter table public.rewards_personal_savings_cycles enable row level security;alter table public.rewards_personal_savings_requests enable row level security;
revoke all on public.rewards_personal_savings,public.rewards_personal_savings_cycles,public.rewards_personal_savings_requests from public,anon,authenticated;
grant select,insert,update,delete on public.rewards_personal_savings,public.rewards_personal_savings_cycles,public.rewards_personal_savings_requests to service_role;

create or replace function public.rewards_personal_savings_rpc(p_actor text,p_action text,p_body jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u public.rewards_users%rowtype;s public.rewards_personal_savings%rowtype;cyc public.rewards_personal_savings_cycles%rowtype;
 req uuid;amt bigint;fee bigint;net bigint;remaining bigint;chunk integer;target_at timestamptz;target_amount bigint;typ text;result jsonb;history jsonb;now_at timestamptz:=clock_timestamp();
begin
 if p_actor is null or p_actor!~'^[0-9]{1,30}$' or p_body is null or jsonb_typeof(p_body)<>'object' then raise exception 'invalid_request';end if;
 if p_action='admin_state' then
  if not exists(select 1 from public.rewards_admins a where a.twitch_user_id=p_actor) then raise exception 'admin_required';end if;
  return jsonb_build_object('active',(select count(*) from public.rewards_personal_savings where status in('active','ready')),'completed',(select count(*) from public.rewards_personal_savings_cycles where status='broken'),'fees',(select coalesce(sum(commission_paid),0)::text from public.rewards_personal_savings_cycles),'rows',coalesce((select jsonb_agg(jsonb_build_object('name',coalesce(u.twitch_display_name,u.twitch_login),'login',u.twitch_login,'status',s.status,'created',coalesce(s.started_at,c.ended_at)::date::text,'saved',s.saved_coins::text,'commission',s.commission_bps,'history',c.cycle_number) order by coalesce(s.started_at,c.ended_at) desc) from public.rewards_personal_savings s join public.rewards_users u on u.id=s.user_id left join lateral(select ended_at,cycle_number from public.rewards_personal_savings_cycles c where c.user_id=s.user_id order by cycle_number desc limit 1)c on true where s.status<>'idle'),'[]'::jsonb));
 end if;
 select * into u from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false) for update;if not found then raise exception 'user_required';end if;
 insert into public.rewards_personal_savings(user_id) values(u.id) on conflict(user_id) do nothing;
 select * into s from public.rewards_personal_savings where user_id=u.id for update;
 if s.status='active' and ((s.goal_type='amount' and s.saved_coins>=s.goal_amount) or (s.goal_type='date' and now_at>=s.goal_at)) then update public.rewards_personal_savings set status='ready',updated_at=now_at where user_id=u.id returning * into s;end if;
 if p_action='state' then
  select coalesce(jsonb_agg(jsonb_build_object('label','Копилка разбита · выплата '||payout::text||' мон.','date',to_char(ended_at at time zone 'UTC','DD.MM.YYYY')) order by ended_at desc),'[]'::jsonb) into history from(select status,payout,ended_at from public.rewards_personal_savings_cycles where user_id=u.id and ended_at is not null order by ended_at desc limit 10)h;
  return jsonb_build_object('status',s.status,'cyclesStarted',s.cycles_started,'goalType',s.goal_type,'goalAt',s.goal_at,'goalAmount',case when s.goal_type='amount' then s.goal_amount::text else null end,'nextActivationFee',case when s.cycles_started=0 then 0 else 50 end,'nextCommissionBps',case when s.cycles_started=0 then 500 else 350 end,'commissionBps',s.commission_bps,'colors',jsonb_build_object('pig',s.pig_color,'glasses',s.glasses_color,'crown',s.crown_color),'history',history);
 elsif p_action='colors' then
  if p_body - array['pig','glasses','crown'] <> '{}'::jsonb or coalesce(p_body->>'pig','')!~'^#[0-9a-fA-F]{6}$' or coalesce(p_body->>'glasses','')!~'^#[0-9a-fA-F]{6}$' or coalesce(p_body->>'crown','')!~'^#[0-9a-fA-F]{6}$' then raise exception 'invalid_request';end if;
  update public.rewards_personal_savings set pig_color=p_body->>'pig',glasses_color=p_body->>'glasses',crown_color=p_body->>'crown',updated_at=now_at where user_id=u.id;return jsonb_build_object('ok',true);
 elsif p_action='start' then
  if s.status<>'idle' then raise exception 'already_active';end if;req:=(p_body->>'requestId')::uuid;typ:=p_body->>'goalType';
  if typ='amount' then if coalesce(p_body->>'amount','')!~'^[1-9][0-9]{0,18}$' then raise exception 'invalid_goal';end if;target_amount:=(p_body->>'amount')::bigint;if target_amount<500 then raise exception 'invalid_goal';end if;target_at:=null;
  elsif typ='date' then target_at:=(p_body->>'goalAt')::timestamptz;if target_at<now_at+interval '10 days' then raise exception 'invalid_goal';end if;target_amount:=null;
  else raise exception 'invalid_goal';end if;
  if exists(select 1 from public.rewards_personal_savings_requests where request_id=req) then select result into result from public.rewards_personal_savings_requests where request_id=req and user_id=u.id;if result is null then raise exception 'invalid_request';end if;return result;end if;
  fee:=case when s.cycles_started=0 then 0 else 50 end;if coalesce((select sum(amount) from public.rewards_coin_transactions where user_id=u.id),0)<fee then raise exception 'insufficient_coins';end if;
  if fee>0 then insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(u.id,-fee,'adjustment','Накопления · активация · '||req);end if;
  update public.rewards_personal_savings set status='active',cycles_started=cycles_started+1,goal_type=typ,goal_amount=target_amount,goal_at=target_at,saved_coins=0,commission_bps=case when cycles_started=0 then 500 else 350 end,started_at=now_at,updated_at=now_at where user_id=u.id returning * into s;
  insert into public.rewards_personal_savings_cycles(user_id,cycle_number,goal_type,goal_amount,goal_at,commission_bps,activation_fee,started_at,status)values(u.id,s.cycles_started,typ,target_amount,target_at,s.commission_bps,fee,now_at,'active');result:=jsonb_build_object('ok',true,'status',s.status);
 elsif p_action='deposit' then
  if s.status<>'active' then raise exception 'cycle_not_ready';end if;req:=(p_body->>'requestId')::uuid;if coalesce(p_body->>'amount','')!~'^[1-9][0-9]{0,18}$' then raise exception 'invalid_request';end if;amt:=(p_body->>'amount')::bigint;
  if exists(select 1 from public.rewards_personal_savings_requests where request_id=req) then select result into result from public.rewards_personal_savings_requests where request_id=req and user_id=u.id;if result is null then raise exception 'invalid_request';end if;return result;end if;
  if coalesce((select sum(amount) from public.rewards_coin_transactions where user_id=u.id),0)<amt then raise exception 'insufficient_coins';end if;
  remaining:=amt;while remaining>0 loop chunk:=least(remaining,2147483647)::integer;insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)values(u.id,-chunk,'adjustment','Накопления · взнос · '||req);remaining:=remaining-chunk;end loop;
  update public.rewards_personal_savings set saved_coins=saved_coins+amt,updated_at=now_at where user_id=u.id returning * into s;update public.rewards_personal_savings_cycles set deposited=s.saved_coins where user_id=u.id and cycle_number=s.cycles_started and status='active';
  if s.goal_type='amount' and s.saved_coins>=s.goal_amount then update public.rewards_personal_savings set status='ready' where user_id=u.id returning * into s;end if;
  result:=jsonb_build_object('ok',true,'status',s.status);insert into public.rewards_personal_savings_requests(request_id,user_id,action,result)values(req,u.id,p_action,result);return result;
 elsif p_action='extend' then
  if s.status<>'ready' then raise exception 'cycle_not_ready';end if;typ:=p_body->>'goalType';
  if typ='amount' then if coalesce(p_body->>'amount','')!~'^[1-9][0-9]{0,18}$' then raise exception 'invalid_goal';end if;amt:=(p_body->>'amount')::bigint;if amt<500 then raise exception 'invalid_goal';end if;target_amount:=s.saved_coins+amt;target_at:=null;
  elsif typ='date' then target_at:=(p_body->>'goalAt')::timestamptz;if target_at<now_at+interval '10 days' then raise exception 'invalid_goal';end if;target_amount:=null;else raise exception 'invalid_goal';end if;
  update public.rewards_personal_savings set status='active',goal_type=typ,goal_amount=target_amount,goal_at=target_at,updated_at=now_at where user_id=u.id returning * into s;update public.rewards_personal_savings_cycles set goal_type=typ,goal_amount=target_amount,goal_at=target_at where user_id=u.id and cycle_number=s.cycles_started and status='active';result:=jsonb_build_object('ok',true,'status',s.status);
 elsif p_action='break' then
  if s.status<>'ready' then raise exception 'cycle_not_ready';end if;req:=(p_body->>'requestId')::uuid;
  if exists(select 1 from public.rewards_personal_savings_requests where request_id=req) then select result into result from public.rewards_personal_savings_requests where request_id=req and user_id=u.id;if result is null then raise exception 'invalid_request';end if;return result;end if;
  select * into strict cyc from public.rewards_personal_savings_cycles where user_id=u.id and cycle_number=s.cycles_started and status='active' for update;fee:=floor(s.saved_coins::numeric*s.commission_bps/10000)::bigint;net:=s.saved_coins-fee;
  update public.rewards_personal_savings_cycles set status='broken',deposited=s.saved_coins,commission_paid=fee,payout=net,ended_at=now_at where id=cyc.id;remaining:=net;while remaining>0 loop chunk:=least(remaining,2147483647)::integer;insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)values(u.id,chunk,'adjustment','Накопления · разбитие · '||req);remaining:=remaining-chunk;end loop;
  update public.rewards_personal_savings set status='idle',goal_type=null,goal_amount=null,goal_at=null,saved_coins=0,started_at=null,updated_at=now_at where user_id=u.id;result:=jsonb_build_object('ok',true,'payout',net::text,'commission',fee::text);
 else raise exception 'invalid_request';end if;
 if p_action in('start','break') then insert into public.rewards_personal_savings_requests(request_id,user_id,action,result)values(req,u.id,p_action,result) on conflict(request_id) do nothing;end if;return result;
end;$$;
revoke all on function public.rewards_personal_savings_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_personal_savings_rpc(text,text,jsonb) to service_role;
