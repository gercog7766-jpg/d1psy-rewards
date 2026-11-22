-- New configurable auctions are opt-in; existing open auctions keep their terms.
alter table public.rewards_black_boxes
 add column step_schedule jsonb,
 add column scheduled_ends_at timestamptz,
 add column min_participants integer not null default 0 check(min_participants in (0,5)),
 add column cancelled boolean not null default false;

create function public.rewards_black_box_step(p_schedule jsonb,p_end timestamptz,p_at timestamptz,p_legacy integer) returns integer
language sql immutable set search_path='' as $$
 select coalesce((select (x.value->>'step')::integer from jsonb_array_elements(p_schedule) with ordinality x(value,rank)
 where extract(epoch from (p_end-p_at))>(x.value->>'untilMinutes')::integer*60 order by x.rank limit 1),
 (p_schedule->-1->>'step')::integer,p_legacy)
$$;

create function public.rewards_black_box_create_v2(p_start integer,p_duration_minutes integer,p_schedule jsonb,p_prize uuid,p_coins integer) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v jsonb; previous_limit integer; previous_step integer:=0; lim integer; step integer; result_id uuid; reserved_prize uuid; title text; photo text; started timestamptz; deadline timestamptz;
begin
 if p_start is null or p_start not between 1 and 1000000000 or p_duration_minutes is null or p_duration_minutes not between 5 and 10080 or jsonb_typeof(p_schedule) is distinct from 'array' then raise exception 'invalid_request';end if;
 if jsonb_array_length(p_schedule) not between 1 and 10 or (p_prize is null)=(p_coins is null) or (p_coins is not null and p_coins not between 1 and 1000000000) then raise exception 'invalid_request';end if;
 previous_limit:=p_duration_minutes;
 for v in select value from jsonb_array_elements(p_schedule) loop
  if jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'untilMinutes') is distinct from 'number' or jsonb_typeof(v->'step') is distinct from 'number' or (v->>'untilMinutes')!~'^[0-9]{1,5}$' or (v->>'step')!~'^[0-9]{1,10}$' then raise exception 'invalid_request';end if;
  lim:=(v->>'untilMinutes')::integer;
  if (v->>'step')::bigint not between 1 and 1000000000 then raise exception 'invalid_request';end if;
  step:=(v->>'step')::integer;
  if lim>=previous_limit or step<previous_step then raise exception 'invalid_request';end if;
  previous_limit:=lim;previous_step:=step;
 end loop;
 if previous_limit<>0 then raise exception 'invalid_request';end if;
 perform public.rewards_black_box_close();
 if exists(select 1 from public.rewards_black_boxes where closed_at is null) then raise exception 'auction_open';end if;
 if p_prize is not null then
  select name,image_url into title,photo from public.rewards_prizes where id=p_prize;
  if not found then raise exception 'unknown_prize';end if;
  insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
   select name,image_url,'disabled',true,1,sell_price_coins from public.rewards_prizes where id=p_prize returning id into reserved_prize;
 else title:=p_coins||' мон.';end if;
 started:=clock_timestamp();deadline:=started+make_interval(mins=>p_duration_minutes);
 insert into public.rewards_black_boxes(starts_at,ends_at,scheduled_ends_at,start_price,bid_step,step_schedule,min_participants,prize_id,prize_coins,prize_name,prize_image)
 values(started,deadline,deadline,p_start,(p_schedule->0->>'step')::integer,p_schedule,5,reserved_prize,p_coins,title,photo) returning id into result_id;
 return result_id;
end$$;

create or replace function public.rewards_black_box_close() returns void
language plpgsql security invoker set search_path='' as $$
declare auction public.rewards_black_boxes%rowtype; participants integer;
begin
 select * into auction from public.rewards_black_boxes where closed_at is null and ends_at<=clock_timestamp() for update;
 if not found then return;end if;
 select count(distinct user_id) into participants from public.rewards_black_box_bids where box_id=auction.id;
 if participants<auction.min_participants then
  if auction.winner_id is not null then
   perform 1 from public.rewards_users where id=auction.winner_id for update;
   insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
    values(auction.winner_id,auction.high_bid,'adjustment','Чёрный ящик · возврат · '||auction.id);
  end if;
  update public.rewards_black_boxes set closed_at=clock_timestamp(),cancelled=true,winner_id=null,high_bid=null where id=auction.id;
  return;
 end if;
 if auction.winner_id is not null then
  perform 1 from public.rewards_users where id=auction.winner_id for update;
  if auction.prize_coins is not null then
   insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(auction.winner_id,auction.prize_coins,'adjustment','Чёрный ящик · приз · '||auction.id);
  else
   insert into public.rewards_wins(user_id,prize_id,source_type,delivery_status,choice_status) values(auction.winner_id,auction.prize_id,'black_box','awaiting_choice','awaiting_choice');
  end if;
 end if;
 update public.rewards_black_boxes set closed_at=clock_timestamp() where id=auction.id;
end$$;

create or replace function public.rewards_black_box_bid(p_box uuid,p_user uuid,p_amount integer) returns void
language plpgsql security invoker set search_path='' as $$
declare auction public.rewards_black_boxes%rowtype; bid_time timestamptz; debit integer; current_step integer;
begin
 select * into auction from public.rewards_black_boxes where id=p_box for update;
 if not found or auction.closed_at is not null then raise exception 'auction_closed';end if;
 perform 1 from public.rewards_users where id in(p_user,auction.winner_id) order by id for update;
 if not exists(select 1 from public.rewards_users where id=p_user and not banned and not participation_restricted) then raise exception 'participation_restricted';end if;
 bid_time:=clock_timestamp();if bid_time>=auction.ends_at then raise exception 'auction_closed';end if;
 current_step:=public.rewards_black_box_step(auction.step_schedule,auction.scheduled_ends_at,bid_time,auction.bid_step);
 if p_amount is null or p_amount>1000000000 or p_amount<coalesce(auction.high_bid::bigint+current_step,auction.start_price) then raise exception 'bid_too_low';end if;
 debit:=p_amount;if auction.winner_id=p_user then debit:=p_amount-auction.high_bid;end if;
 if (select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=p_user)<debit then raise exception 'insufficient_coins';end if;
 if auction.winner_id is not null and auction.winner_id<>p_user then
  insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(auction.winner_id,auction.high_bid,'adjustment','Чёрный ящик · возврат · '||p_box);
 end if;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user,-debit,'adjustment','Чёрный ящик · ставка · '||p_box);
 insert into public.rewards_black_box_bids(box_id,user_id,amount) values(p_box,p_user,p_amount);
 update public.rewards_black_boxes set winner_id=p_user,high_bid=p_amount,ends_at=case
  when step_schedule is null and ends_at-bid_time<=interval '10 minutes' then ends_at+interval '2 minutes'
  when step_schedule is not null and ends_at-bid_time<=interval '2 minutes' then least(greatest(ends_at,bid_time+interval '2 minutes'),scheduled_ends_at+interval '15 minutes')
  else ends_at end where id=p_box;
end$$;

create or replace function public.rewards_black_box_state() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare current_box jsonb; previous_box jsonb; closed_box jsonb; participants jsonb; stamp timestamptz;
begin
 perform public.rewards_black_box_close();stamp:=clock_timestamp();
 select jsonb_build_object('id',a.id,'endsAt',a.ends_at,'startPrice',a.start_price,'step',public.rewards_black_box_step(a.step_schedule,a.scheduled_ends_at,stamp,a.bid_step),
 'hint',a.hint,'highBid',a.high_bid,'schedule',a.step_schedule,'scheduledEndsAt',a.scheduled_ends_at,'minimumParticipants',a.min_participants) into current_box from public.rewards_black_boxes a where a.closed_at is null;
 select jsonb_build_object('id',a.id,'amount',a.high_bid,'prize',a.prize_name,'image',a.prize_image,'winner',coalesce(u.twitch_display_name,u.twitch_login)) into previous_box
 from public.rewards_black_boxes a join public.rewards_users u on u.id=a.winner_id where a.closed_at is not null and not a.cancelled order by a.closed_at desc limit 1;
 select jsonb_build_object('id',a.id,'amount',a.high_bid,'prize',case when not a.cancelled then a.prize_name end,'winner',coalesce(u.twitch_display_name,u.twitch_login),'cancelled',a.cancelled,
 'participantCount',(select count(distinct b.user_id) from public.rewards_black_box_bids b where b.box_id=a.id),'minimumParticipants',a.min_participants) into closed_box
 from public.rewards_black_boxes a left join public.rewards_users u on u.id=a.winner_id where a.closed_at is not null order by a.closed_at desc limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('name',coalesce(u.twitch_display_name,u.twitch_login),'amount',b.amount) order by b.amount desc),'[]'::jsonb) into participants
 from (select user_id,max(amount) as amount from public.rewards_black_box_bids where box_id=(current_box->>'id')::uuid group by user_id) b join public.rewards_users u on u.id=b.user_id;
 return jsonb_build_object('current',current_box,'previous',previous_box,'closed',closed_box,'participants',participants,'serverNow',stamp);
end$$;
revoke all on function public.rewards_black_box_step(jsonb,timestamptz,timestamptz,integer),public.rewards_black_box_create_v2(integer,integer,jsonb,uuid,integer) from public,anon,authenticated;
grant execute on function public.rewards_black_box_step(jsonb,timestamptz,timestamptz,integer),public.rewards_black_box_create_v2(integer,integer,jsonb,uuid,integer) to service_role;
notify pgrst,'reload schema';
