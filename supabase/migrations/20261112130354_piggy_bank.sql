create table public.rewards_piggy_days (
 day date primary key,
 closed_at timestamptz not null default clock_timestamp(),
 status text not null check(status in ('awarded','refunded')),
 pot bigint not null,
 prize_budget bigint not null
);
create table public.rewards_piggy_entries (
 day date not null,
 user_id uuid not null references public.rewards_users(id),
 amount bigint not null check(amount>0),
 primary key(day,user_id)
);
create table public.rewards_piggy_payments (
 request_id uuid primary key,
 day date not null,
 user_id uuid not null references public.rewards_users(id),
 amount bigint not null check(amount>0)
);
create index rewards_piggy_payments_day on public.rewards_piggy_payments(day);
create table public.rewards_piggy_winners (
 day date not null references public.rewards_piggy_days(day),
 user_id uuid not null references public.rewards_users(id),
 win_id uuid not null references public.rewards_wins(id),
 prize_id uuid not null references public.rewards_prizes(id),
 value integer not null,
 primary key(day,user_id)
);
alter table public.rewards_piggy_days enable row level security;
alter table public.rewards_piggy_entries enable row level security;
alter table public.rewards_piggy_payments enable row level security;
alter table public.rewards_piggy_winners enable row level security;
revoke all on public.rewards_piggy_days,public.rewards_piggy_entries,public.rewards_piggy_payments,public.rewards_piggy_winners from public,anon,authenticated;
grant select,insert on public.rewards_piggy_days,public.rewards_piggy_payments,public.rewards_piggy_winners to service_role;
grant select,insert,update on public.rewards_piggy_entries to service_role;

create function public.rewards_piggy_day(p_now timestamptz) returns date
language sql stable security invoker set search_path='' as $$
 select ((p_now at time zone 'Europe/Berlin') - interval '20 hours')::date+1
$$;

create function public.rewards_piggy_add(p_user uuid,p_day date,p_amount bigint,p_request uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare paid public.rewards_piggy_payments%rowtype; remaining bigint; chunk integer;
begin
 if p_day is null or p_amount is null or p_amount<=0 or p_request is null then raise exception 'invalid_request'; end if;
 perform pg_advisory_xact_lock(482019,p_day-date '2000-01-01');
 perform 1 from public.rewards_users where id=p_user and not banned and not participation_restricted for update;
 if not found then raise exception 'participation_restricted'; end if;
 select * into paid from public.rewards_piggy_payments where request_id=p_request;
 if found then
  if paid.user_id=p_user and paid.amount=p_amount and paid.day=p_day then return; end if;
  raise exception 'invalid_request';
 end if;
 if p_day<>public.rewards_piggy_day(clock_timestamp()) then raise exception 'day_closed'; end if;
 if (select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=p_user)<p_amount then
  raise exception 'insufficient_coins';
 end if;
 insert into public.rewards_piggy_payments values(p_request,p_day,p_user,p_amount);
 remaining:=p_amount;
 while remaining>0 loop
  chunk:=least(remaining,2147483647)::integer;
  insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
  values(p_user,-chunk,'adjustment','Копилка · взнос · '||p_request);
  remaining:=remaining-chunk;
 end loop;
 insert into public.rewards_piggy_entries as e(day,user_id,amount) values(p_day,p_user,p_amount)
 on conflict(day,user_id) do update set amount=e.amount+excluded.amount;
end;
$$;

create function public.rewards_piggy_close() returns void
language plpgsql security invoker set search_path='' as $$
declare due date; collected bigint; budget bigint; min_price integer; eligible integer; maximum integer;
 winner_count integer; player record; prize record; remaining bigint; chunk integer; left_slots integer;
 reward_prize uuid; reward_win uuid; refund bigint;
begin
 select min(e.day) into due from public.rewards_piggy_entries e
 where e.day<public.rewards_piggy_day(clock_timestamp())
 and not exists(select 1 from public.rewards_piggy_days d where d.day=e.day);
 if due is null or not pg_try_advisory_xact_lock(482019,due-date '2000-01-01') then return; end if;
 if exists(select 1 from public.rewards_piggy_days d where d.day=due) then return; end if;
 select coalesce(sum(e.amount),0),count(*) filter(where not u.banned and not u.participation_restricted)
 into collected,eligible from public.rewards_piggy_entries e join public.rewards_users u on u.id=e.user_id where e.day=due;
 budget:=floor(collected::numeric*0.9);
 select min(sell_price_coins) into min_price from public.rewards_prizes
 where status='available' and unlimited and sell_price_coins>0;
 maximum:=case when min_price is null then 0 else least(3,eligible,budget/min_price)::integer end;
 if maximum=0 then
  insert into public.rewards_piggy_days(day,status,pot,prize_budget) values(due,'refunded',collected,budget);
  perform 1 from public.rewards_users u where exists (
   select 1 from public.rewards_piggy_entries e where e.day=due and e.user_id=u.id
  ) order by u.id for update;
  for player in select e.user_id,e.amount from public.rewards_piggy_entries e where e.day=due loop
   remaining:=player.amount;
   while remaining>0 loop
    chunk:=least(remaining,2147483647)::integer;
    insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
    values(player.user_id,chunk,'adjustment','Копилка · возврат · '||due);
    remaining:=remaining-chunk;
   end loop;
  end loop;
  return;
 end if;
 winner_count:=1+floor(random()*maximum)::integer;
 remaining:=budget;
 left_slots:=winner_count;
 insert into public.rewards_piggy_days(day,status,pot,prize_budget) values(due,'awarded',collected,budget);
 for player in
  select e.user_id from public.rewards_piggy_entries e join public.rewards_users u on u.id=e.user_id
  where e.day=due and not u.banned and not u.participation_restricted
  order by -ln((('x'||substr(gen_random_uuid()::text,1,8)||substr(gen_random_uuid()::text,10,4))::bit(48)::bigint+1)/281474976710657.0)/e.amount
  limit winner_count
 loop
  select p.name,p.image_url,p.sell_price_coins into strict prize from public.rewards_prizes p
  where p.status='available' and p.unlimited and p.sell_price_coins>0 and p.sell_price_coins<=remaining/left_slots
  order by p.sell_price_coins desc,gen_random_uuid() limit 1;
  insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
  values(prize.name,prize.image_url,'disabled',true,1,prize.sell_price_coins) returning id into reward_prize;
  insert into public.rewards_wins(user_id,prize_id,source_type,delivery_status,choice_status)
  values(player.user_id,reward_prize,'piggy_bank','awaiting_choice','awaiting_choice') returning id into reward_win;
  insert into public.rewards_piggy_winners values(due,player.user_id,reward_win,reward_prize,prize.sell_price_coins);
  remaining:=remaining-prize.sell_price_coins;
  left_slots:=left_slots-1;
 end loop;
 if remaining>0 then
  perform 1 from public.rewards_users u where exists (
   select 1 from public.rewards_piggy_entries e where e.day=due and e.user_id=u.id
  ) order by u.id for update;
  for player in
   select e.user_id,e.amount,sum(e.amount) over(order by e.user_id) as running
   from public.rewards_piggy_entries e where e.day=due
  loop
   refund:=floor(remaining::numeric*player.running/collected)
          -floor(remaining::numeric*(player.running-player.amount)/collected);
   while refund>0 loop
    chunk:=least(refund,2147483647)::integer;
    insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
    values(player.user_id,chunk,'adjustment','Копилка · остаток · '||due);
    refund:=refund-chunk;
   end loop;
  end loop;
 end if;
end;
$$;

create function public.rewards_piggy_state() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare moment timestamptz:=clock_timestamp(); active_day date; result jsonb;
begin
 active_day:=public.rewards_piggy_day(moment);
 select jsonb_build_object('day',d.day,'status',d.status,'winners',coalesce((
  select jsonb_agg(jsonb_build_object('name',coalesce(u.twitch_display_name,u.twitch_login),'skin',p.name))
  from public.rewards_piggy_winners w join public.rewards_users u on u.id=w.user_id
  join public.rewards_prizes p on p.id=w.prize_id where w.day=d.day
 ),'[]'::jsonb)) into result from public.rewards_piggy_days d order by d.day desc limit 1;
 return jsonb_build_object('day',active_day,'now',moment,'endsAt',(active_day+time '20:00') at time zone 'Europe/Berlin','previous',result);
end;
$$;

revoke all on function public.rewards_piggy_day(timestamptz),public.rewards_piggy_add(uuid,date,bigint,uuid),
 public.rewards_piggy_close(),public.rewards_piggy_state() from public,anon,authenticated;
grant execute on function public.rewards_piggy_day(timestamptz),public.rewards_piggy_add(uuid,date,bigint,uuid),
 public.rewards_piggy_close(),public.rewards_piggy_state() to service_role;

create function public.rewards_piggy_admin(p_day date,p_offset integer) returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object(
  'day',p_day,
  'activeDay',public.rewards_piggy_day(clock_timestamp()),
  'total',(select coalesce(sum(e.amount),0)::text from public.rewards_piggy_entries e where e.day=p_day),
  'people',(select count(*) from public.rewards_piggy_entries e where e.day=p_day),
  'transactions',(select count(*) from public.rewards_piggy_payments p where p.day=p_day),
  'previous',coalesce((select jsonb_agg(d.day order by d.day desc) from (
   select day from public.rewards_piggy_days
  ) d),'[]'::jsonb),
  'result',(select jsonb_build_object('status',d.status,'budget',d.prize_budget::text,'prizeValue',coalesce((select sum(w.value) from public.rewards_piggy_winners w where w.day=d.day),0)::text)
   from public.rewards_piggy_days d where d.day=p_day),
  'entries',coalesce((select jsonb_agg(jsonb_build_object('name',e.name,'amount',e.amount::text,'skin',e.skin,'value',e.value) order by e.amount desc,e.user_id)
   from (select e.user_id,e.amount,coalesce(u.twitch_display_name,u.twitch_login) as name,p.name as skin,w.value
    from public.rewards_piggy_entries e join public.rewards_users u on u.id=e.user_id
    left join public.rewards_piggy_winners w on w.day=e.day and w.user_id=e.user_id
    left join public.rewards_prizes p on p.id=w.prize_id
    where e.day=p_day order by e.amount desc,e.user_id offset p_offset limit 100) e),'[]'::jsonb)
 );
$$;
revoke all on function public.rewards_piggy_admin(date,integer) from public,anon,authenticated;
grant execute on function public.rewards_piggy_admin(date,integer) to service_role;
