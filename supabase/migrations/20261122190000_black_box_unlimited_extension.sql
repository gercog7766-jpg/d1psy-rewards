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
  when ends_at-bid_time<=interval '10 minutes' then ends_at+interval '2 minutes'
  else ends_at end where id=p_box;
end$$;

notify pgrst,'reload schema';
