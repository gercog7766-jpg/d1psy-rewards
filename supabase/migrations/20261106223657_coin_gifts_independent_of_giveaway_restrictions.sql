-- Giveaway participation restrictions do not prohibit transfers of existing coins.
-- Bans, blocks, funds, atomicity, idempotency and per-pair daily limits remain enforced.
create or replace function public.rewards_send_coin_gift(p_user uuid,p_login text,p_amount integer,p_request uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare peer uuid; previous public.rewards_coin_gifts; used integer; balance bigint; day date; stamp timestamptz; debit uuid; credit uuid; gift uuid; sender_name text; peer_name text;
begin
 peer:=public.rewards_social_peer(p_user,p_login);
 if p_request is null or p_amount is null or p_amount not between 1 and 10 then raise exception 'invalid_amount';end if;
 -- The same user-row lock as purchases and Live; stable order also protects opposite-direction transfers.
 perform 1 from public.rewards_users where id in(p_user,peer) order by id for update;
 select * into previous from public.rewards_coin_gifts where sender_id=p_user and request_id=p_request;
 if found then
  if previous.recipient_id<>peer or previous.amount<>p_amount then raise exception 'request_conflict';end if;
  return jsonb_build_object('ok',true,'giftId',previous.id,'coins',previous.amount,'alreadySent',true);
 end if;
 if exists(select 1 from public.rewards_users where id in(p_user,peer) and coalesce(banned,false)) then raise exception 'user_unavailable';end if;
 if public.rewards_social_blocked(p_user,peer) then raise exception 'contact_unavailable';end if;
 stamp:=clock_timestamp();day:=(stamp at time zone 'Europe/Moscow')::date;
 select coalesce(sum(amount),0) into used from public.rewards_coin_gifts where sender_id=p_user and recipient_id=peer and gift_day=day;
 if used+p_amount>10 then raise exception 'gift_daily_limit';end if;
 select coalesce(sum(amount),0) into balance from public.rewards_coin_transactions where user_id=p_user;
 if balance<p_amount then raise exception 'insufficient_coins';end if;
 select coalesce(twitch_display_name,twitch_login) into sender_name from public.rewards_users where id=p_user;
 select coalesce(twitch_display_name,twitch_login) into peer_name from public.rewards_users where id=peer;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note,created_at) values(p_user,-p_amount,'gift_sent','Подарок для '||peer_name,stamp) returning id into debit;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note,created_at) values(peer,p_amount,'gift_received','Подарок от '||sender_name,stamp) returning id into credit;
 insert into public.rewards_coin_gifts(sender_id,recipient_id,request_id,amount,gift_day,sender_transaction,recipient_transaction,created_at) values(p_user,peer,p_request,p_amount,day,debit,credit,stamp) returning id into gift;
 return jsonb_build_object('ok',true,'giftId',gift,'coins',p_amount,'alreadySent',false);
end $$;
