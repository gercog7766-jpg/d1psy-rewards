-- Closed paid benefits: only an administrator with a verified active receipt
-- can receive higher limits. Test orders and existing balances are untouched.
create function public.rewards_stars_gift_tier(p_user uuid) returns text
language plpgsql stable security invoker set search_path='' as $$
declare actor text;
begin
 select u.twitch_user_id into actor from public.rewards_users u join public.rewards_admins a on a.twitch_user_id=u.twitch_user_id where u.id=p_user and not coalesce(u.banned,false);
 if actor is null then return 'free';end if;
 return coalesce(public.rewards_stars_entitlements(actor)->>'tier','free');
end $$;
revoke all on function public.rewards_stars_gift_tier(uuid) from public,anon,authenticated;
grant execute on function public.rewards_stars_gift_tier(uuid) to service_role;
alter table public.rewards_coin_gifts drop constraint rewards_coin_gifts_amount_check;
alter table public.rewards_coin_gifts add constraint rewards_coin_gifts_amount_check check(amount between 1 and 200);
alter table public.rewards_skin_gifts add column price_coins integer not null default 30 check(price_coins between 1 and 300);
alter table public.rewards_skin_gifts drop constraint rewards_skin_gifts_pkey;
alter table public.rewards_skin_gifts add primary key(sender_id,request_id);
create index rewards_skin_gifts_sender_day_idx on public.rewards_skin_gifts(sender_id,gift_day);

create or replace function public.rewards_send_coin_gift(p_user uuid,p_login text,p_amount integer,p_request uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare peer uuid; previous public.rewards_coin_gifts; used bigint; balance bigint; day date; stamp timestamptz; debit uuid; credit uuid; gift uuid; sender_name text; peer_name text; cap integer;
begin
 peer:=public.rewards_social_peer(p_user,p_login);
 if p_request is null or p_amount is null or p_amount not between 1 and 200 then raise exception 'invalid_amount';end if;
 perform 1 from public.rewards_users where id in(p_user,peer) order by id for update;
 select * into previous from public.rewards_coin_gifts where sender_id=p_user and request_id=p_request;
 if found then
  if previous.recipient_id<>peer or previous.amount<>p_amount then raise exception 'request_conflict';end if;
  return jsonb_build_object('ok',true,'giftId',previous.id,'coins',previous.amount,'alreadySent',true);
 end if;
 if exists(select 1 from public.rewards_users where id in(p_user,peer) and coalesce(banned,false)) then raise exception 'user_unavailable';end if;
 if public.rewards_social_blocked(p_user,peer) then raise exception 'contact_unavailable';end if;
 stamp:=clock_timestamp();day:=(stamp at time zone 'Europe/Moscow')::date;
 cap:=case public.rewards_stars_gift_tier(p_user) when 'plus' then 200 when 'lite' then 100 else 20 end;
 select coalesce(sum(amount),0) into used from public.rewards_coin_gifts where sender_id=p_user and gift_day=day;
 if used+p_amount>cap then raise exception 'gift_daily_limit';end if;
 select coalesce(sum(amount),0) into balance from public.rewards_coin_transactions where user_id=p_user;
 if balance<p_amount then raise exception 'insufficient_coins';end if;
 select coalesce(twitch_display_name,twitch_login) into sender_name from public.rewards_users where id=p_user;
 select coalesce(twitch_display_name,twitch_login) into peer_name from public.rewards_users where id=peer;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note,created_at) values(p_user,-p_amount,'gift_sent','Подарок для '||peer_name,stamp) returning id into debit;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note,created_at) values(peer,p_amount,'gift_received','Подарок от '||sender_name,stamp) returning id into credit;
 insert into public.rewards_coin_gifts(sender_id,recipient_id,request_id,amount,gift_day,sender_transaction,recipient_transaction,created_at) values(p_user,peer,p_request,p_amount,day,debit,credit,stamp) returning id into gift;
 return jsonb_build_object('ok',true,'giftId',gift,'coins',p_amount,'alreadySent',false);
end $$;

create or replace function public.rewards_social_profile(p_user uuid,p_login text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare peer uuid; f public.rewards_friendships; used bigint; day date; blocked boolean; cap integer;
begin
 peer:=public.rewards_social_peer(p_user,p_login);day:=(clock_timestamp() at time zone 'Europe/Moscow')::date;
 select * into f from public.rewards_friendships where user_low=least(p_user,peer) and user_high=greatest(p_user,peer);
 select coalesce(sum(amount),0) into used from public.rewards_coin_gifts where sender_id=p_user and gift_day=day;
 cap:=case public.rewards_stars_gift_tier(p_user) when 'plus' then 200 when 'lite' then 100 else 20 end;
 blocked:=public.rewards_social_blocked(p_user,peer);
 return jsonb_build_object('relationship',case when f.status='accepted' then 'friends' when f.status='pending' then case when f.requested_by=p_user then 'outgoing' else 'incoming' end else 'none' end,
 'canContact',not blocked,'blockedByMe',exists(select 1 from public.rewards_social_blocks where user_id=p_user and blocked_id=peer),'giftRemaining',greatest(0,cap-used),'giftResetAt',(day+1)::timestamp at time zone 'Europe/Moscow','viewerBalance',(select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=p_user));
end $$;

create or replace function public.rewards_skin_gift(p_actor text,p_login text,p_win uuid default null,p_request uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare sender uuid; peer uuid; current_day date; previous public.rewards_skin_gifts; item public.rewards_wins; price integer; received uuid; tier text; cap integer; used bigint; n bigint;
begin
 select id into sender from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false);
 if sender is null then raise exception 'user_unavailable';end if;
 peer:=public.rewards_social_peer(sender,p_login);
 if public.rewards_social_blocked(sender,peer) then raise exception 'contact_unavailable';end if;
 if p_win is not null or p_request is not null then
  if p_win is null or p_request is null then raise exception 'invalid_request';end if;
  perform 1 from public.rewards_users where id in(sender,peer) order by id for update;
  if exists(select 1 from public.rewards_users where id in(sender,peer) and coalesce(banned,false)) then raise exception 'user_unavailable';end if;
  if public.rewards_social_blocked(sender,peer) then raise exception 'contact_unavailable';end if;
  select * into previous from public.rewards_skin_gifts g where g.sender_id=sender and g.request_id=p_request;
  if found then if previous.recipient_id<>peer or previous.source_win<>p_win then raise exception 'request_conflict';end if;return jsonb_build_object('ok',true);end if;
 end if;
 current_day:=(clock_timestamp() at time zone 'Europe/Moscow')::date;
 tier:=public.rewards_stars_gift_tier(sender);cap:=case tier when 'plus' then 300 when 'lite' then 150 else 30 end;
 select coalesce(sum(price_coins),0),count(*) into used,n from public.rewards_skin_gifts where sender_id=sender and gift_day=current_day;
 if tier='free' and n>0 then used:=cap;end if;
 if p_win is null then
  return jsonb_build_object('used',used>=cap,'remaining',greatest(0,cap-used),'limit',cap,'items',(select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'name',p.name,'price',p.sell_price_coins,'wear',w.item_wear,'kind',w.item_variant_kind) order by w.won_at desc),'[]'::jsonb) from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id where w.user_id=sender and w.choice_status='awaiting_choice' and w.source_type is distinct from 'promo_upgrade' and w.delivery_status in('awaiting_choice','pending') and p.sell_price_coins between 1 and greatest(0,cap-used)));
 end if;
 if used>=cap then raise exception 'skin_gift_limit';end if;
 select * into item from public.rewards_wins where id=p_win and user_id=sender and choice_status='awaiting_choice' and source_type is distinct from 'promo_upgrade' and delivery_status in('awaiting_choice','pending') for update;
 if not found then raise exception 'skin_unavailable';end if;
 select sell_price_coins into price from public.rewards_prizes where id=item.prize_id for share;
 if price is null or price<1 or price>cap then raise exception 'skin_unavailable';end if;
 if used+price>cap then raise exception 'skin_gift_limit';end if;
 update public.rewards_wins set choice_status='gifted',choice_at=now() where id=item.id;
 insert into public.rewards_wins(user_id,prize_id,source_type,delivery_status,choice_status,item_wear,item_variant_kind) values(peer,item.prize_id,'skin_gift','awaiting_choice','awaiting_choice',item.item_wear,item.item_variant_kind) returning id into received;
 insert into public.rewards_skin_gifts(sender_id,recipient_id,gift_day,request_id,source_win,received_win,price_coins) values(sender,peer,current_day,p_request,item.id,received,price);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.rewards_send_coin_gift(uuid,text,integer,uuid),public.rewards_social_profile(uuid,text),public.rewards_skin_gift(text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.rewards_send_coin_gift(uuid,text,integer,uuid),public.rewards_social_profile(uuid,text),public.rewards_skin_gift(text,text,uuid,uuid) to service_role;
notify pgrst,'reload schema';
