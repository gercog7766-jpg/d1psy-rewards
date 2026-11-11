create table public.rewards_black_boxes (
 id uuid primary key default gen_random_uuid(),
 starts_at timestamptz not null default clock_timestamp(),
 ends_at timestamptz not null,
 closed_at timestamptz,
 start_price integer not null check(start_price between 1 and 1000000000),
 bid_step integer not null check(bid_step between 1 and 1000000000),
 hint text check(length(hint)<=400),
 prize_id uuid references public.rewards_prizes(id),
 prize_coins integer check(prize_coins between 1 and 1000000000),
 prize_name text not null,
 prize_image text,
 winner_id uuid references public.rewards_users(id),
 high_bid integer,
 check ((prize_id is null) <> (prize_coins is null)),
 check ((winner_id is null) = (high_bid is null))
);
create unique index rewards_black_boxes_one_open on public.rewards_black_boxes ((1)) where closed_at is null;
create table public.rewards_black_box_bids (
 id bigint generated always as identity primary key,
 box_id uuid not null references public.rewards_black_boxes(id),
 user_id uuid not null references public.rewards_users(id),
 amount integer not null check(amount between 1 and 1000000000)
);
create index rewards_black_box_bids_box_user on public.rewards_black_box_bids (box_id,user_id,amount desc);
alter table public.rewards_black_boxes enable row level security;
alter table public.rewards_black_box_bids enable row level security;
revoke all on public.rewards_black_boxes,public.rewards_black_box_bids from public,anon,authenticated;
grant select,insert,update on public.rewards_black_boxes to service_role;
grant select,insert on public.rewards_black_box_bids to service_role;
grant usage on sequence public.rewards_black_box_bids_id_seq to service_role;

create function public.rewards_black_box_close() returns void
language plpgsql security invoker set search_path='' as $$
declare auction public.rewards_black_boxes%rowtype;
begin
 select * into auction from public.rewards_black_boxes
 where closed_at is null and ends_at<=clock_timestamp() for update;
 if not found then return; end if;
 if auction.winner_id is not null then
  perform 1 from public.rewards_users where id=auction.winner_id for update;
  if auction.prize_coins is not null then
   insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
   values(auction.winner_id,auction.prize_coins,'adjustment','Чёрный ящик · приз · '||auction.id);
  else
   insert into public.rewards_wins(user_id,prize_id,source_type,delivery_status,choice_status)
   values(auction.winner_id,auction.prize_id,'black_box','awaiting_choice','awaiting_choice');
  end if;
 end if;
 update public.rewards_black_boxes set closed_at=clock_timestamp() where id=auction.id;
end;
$$;

create function public.rewards_black_box_create(p_start integer,p_step integer,p_hint text,p_prize uuid,p_coins integer) returns uuid
language plpgsql security invoker set search_path='' as $$
declare result_id uuid; reserved_prize uuid; title text; photo text; started timestamptz;
begin
 perform public.rewards_black_box_close();
 if exists(select 1 from public.rewards_black_boxes where closed_at is null) then raise exception 'auction_open'; end if;
 if p_prize is not null then
  select name,image_url into title,photo from public.rewards_prizes where id=p_prize;
  if not found then raise exception 'unknown_prize'; end if;
  insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
  select name,image_url,'disabled',true,1,sell_price_coins from public.rewards_prizes where id=p_prize
  returning id into reserved_prize;
 else
  title:=p_coins||' мон.';
 end if;
 started:=clock_timestamp();
 insert into public.rewards_black_boxes(starts_at,ends_at,start_price,bid_step,hint,prize_id,prize_coins,prize_name,prize_image)
 values(started,started+interval '6 hours',p_start,p_step,nullif(btrim(p_hint),''),reserved_prize,p_coins,title,photo)
 returning id into result_id;
 return result_id;
end;
$$;

create function public.rewards_black_box_bid(p_box uuid,p_user uuid,p_amount integer) returns void
language plpgsql security invoker set search_path='' as $$
declare auction public.rewards_black_boxes%rowtype; bid_time timestamptz; debit integer;
begin
 select * into auction from public.rewards_black_boxes where id=p_box for update;
 if not found or auction.closed_at is not null then raise exception 'auction_closed'; end if;
 if p_amount is null or p_amount>1000000000 or
    p_amount<coalesce(auction.high_bid+auction.bid_step,auction.start_price)
 then raise exception 'bid_too_low'; end if;
 perform 1 from public.rewards_users where id in(p_user,auction.winner_id) order by id for update;
 if not exists(select 1 from public.rewards_users where id=p_user and not banned and not participation_restricted)
 then raise exception 'participation_restricted'; end if;
 bid_time:=clock_timestamp();
 if bid_time>=auction.ends_at then raise exception 'auction_closed'; end if;
 debit:=p_amount;
 if auction.winner_id=p_user then debit:=p_amount-auction.high_bid; end if;
 if (select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=p_user)<debit
 then raise exception 'insufficient_coins'; end if;
 if auction.winner_id is not null and auction.winner_id<>p_user then
  insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
  values(auction.winner_id,auction.high_bid,'adjustment','Чёрный ящик · возврат · '||p_box);
 end if;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
 values(p_user,-debit,'adjustment','Чёрный ящик · ставка · '||p_box);
 insert into public.rewards_black_box_bids(box_id,user_id,amount) values(p_box,p_user,p_amount);
 update public.rewards_black_boxes
 set winner_id=p_user,high_bid=p_amount,
 ends_at=case when ends_at-bid_time<=interval '10 minutes' then ends_at+interval '2 minutes' else ends_at end
 where id=p_box;
end;
$$;

create function public.rewards_black_box_state() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare current_box jsonb; previous_box jsonb; closed_box jsonb; participants jsonb;
begin
 perform public.rewards_black_box_close();
 select jsonb_build_object('id',a.id,'endsAt',a.ends_at,'startPrice',a.start_price,'step',a.bid_step,
 'hint',a.hint,'highBid',a.high_bid) into current_box
 from public.rewards_black_boxes a where a.closed_at is null;
 select jsonb_build_object('id',a.id,'amount',a.high_bid,'prize',a.prize_name,'image',a.prize_image,
 'winner',coalesce(u.twitch_display_name,u.twitch_login)) into previous_box
 from public.rewards_black_boxes a join public.rewards_users u on u.id=a.winner_id
 where a.closed_at is not null order by a.closed_at desc limit 1;
 select jsonb_build_object('id',a.id,'amount',a.high_bid,'prize',a.prize_name,
 'winner',coalesce(u.twitch_display_name,u.twitch_login)) into closed_box
 from public.rewards_black_boxes a left join public.rewards_users u on u.id=a.winner_id
 where a.closed_at is not null order by a.closed_at desc limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('name',coalesce(u.twitch_display_name,u.twitch_login),'amount',b.amount)
 order by b.amount desc),'[]'::jsonb) into participants
 from (select user_id,max(amount) as amount from public.rewards_black_box_bids
 where box_id=(current_box->>'id')::uuid group by user_id) b
 join public.rewards_users u on u.id=b.user_id;
 return jsonb_build_object('current',current_box,'previous',previous_box,'closed',closed_box,'participants',participants,'serverNow',clock_timestamp());
end;
$$;
revoke all on function public.rewards_black_box_close(),public.rewards_black_box_create(integer,integer,text,uuid,integer),
 public.rewards_black_box_bid(uuid,uuid,integer),public.rewards_black_box_state() from public,anon,authenticated;
grant execute on function public.rewards_black_box_close(),public.rewards_black_box_create(integer,integer,text,uuid,integer),
 public.rewards_black_box_bid(uuid,uuid,integer),public.rewards_black_box_state() to service_role;
