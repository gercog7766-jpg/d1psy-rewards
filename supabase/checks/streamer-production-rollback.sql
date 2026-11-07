-- Verification only: every credit, win, order, XP entry and push job is rolled back.
begin;
set local role service_role;
do $$
declare u public.rewards_users;p public.rewards_prizes;rid uuid:=gen_random_uuid();pid uuid:=gen_random_uuid();cid uuid:=gen_random_uuid();wid uuid;body jsonb;coin_body jsonb;initial_wallet bigint;actual_wallet bigint;pc text:='STR-VERIFY-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));cc text:='STR-COIN-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));result jsonb;i integer;
begin
 if not exists(select 1 from public.rewards_streamer_live_profiles where broadcaster_id='39780903' and status='approved') then raise exception 'amych_not_approved';end if;
 select * into u from public.rewards_users where not banned and not participation_restricted and steam_trade_url_valid and twitch_user_id not in('39780903','511100980') order by id limit 1;
 select * into p from public.rewards_prizes where status='available' and unlimited and sell_price_coins between 2 and 20 order by sell_price_coins,id limit 1;
 if u.id is null or p.id is null then raise exception 'verification_fixture_missing';end if;
 initial_wallet:=(public.rewards_streamer_live_api('39780903','state')->>'balance')::bigint;
 perform public.rewards_streamer_live_api('511100980','switch','{"enabled":true}');
 body:=jsonb_build_object('broadcaster','39780903','amount',100,'requestId',gen_random_uuid());
 perform public.rewards_streamer_live_api('511100980','topup',body);perform public.rewards_streamer_live_api('511100980','topup',body);
 body:=jsonb_build_object('requestId',rid,'mode','messages','seconds',60,'threshold',5,'minPrice',p.sell_price_coins,'maxPrice',p.sell_price_coins);
 perform public.rewards_streamer_live_api('39780903','start',body);perform public.rewards_streamer_live_api('39780903','start',body);
 for i in 1..5 loop perform public.rewards_streamer_live_chat('39780903','verify-'||rid||'-'||i,u.twitch_user_id,clock_timestamp());end loop;
 select win_id into wid from public.rewards_streamer_live_awards where round_id=rid and user_id=u.id;
 if wid is null then raise exception 'real_inventory_award_missing';end if;
 perform public.rewards_claim_win(wid,u.id);
 if not exists(select 1 from public.rewards_orders where win_id=wid and user_id=u.id and status='pending') then raise exception 'claim_order_missing';end if;
 body:=jsonb_build_object('requestId',pid,'code',pc,'rewardType','prize','prizeId',p.id,'uses',1,'expiresAt',clock_timestamp()+interval '1 hour');
 perform public.rewards_streamer_live_api('39780903','promo',body);perform public.rewards_streamer_live_redeem(u.twitch_user_id,pc);perform public.rewards_streamer_live_redeem(u.twitch_user_id,pc);
 if (select count(*) from public.rewards_streamer_live_awards where promo_id=pid)<>1 then raise exception 'duplicate_skin_award';end if;
 select win_id into wid from public.rewards_streamer_live_awards where promo_id=pid;
 perform public.rewards_sell_win(wid,u.id);
 if not exists(select 1 from public.rewards_coin_transactions where win_id=wid and transaction_type='win_sale' and amount=p.sell_price_coins) then raise exception 'sale_failed';end if;
 coin_body:=jsonb_build_object('requestId',cid,'code',cc,'rewardType','coins','coinAmount',7,'uses',2,'expiresAt',clock_timestamp()+interval '1 hour');
 perform public.rewards_streamer_live_api('39780903','promo',coin_body);perform public.rewards_streamer_live_redeem(u.twitch_user_id,cc);perform public.rewards_streamer_live_redeem(u.twitch_user_id,cc);
 if (select count(*) from public.rewards_streamer_live_awards a join public.rewards_coin_transactions c on c.id=a.coin_transaction_id where a.promo_id=cid and c.user_id=u.id and c.amount=7)<>1 then raise exception 'coin_award_not_exactly_once';end if;
 begin
  perform public.rewards_streamer_live_redeem('39780903',cc);raise exception 'self_redemption_allowed';
 exception when others then if sqlerrm<>'self_reward_forbidden' then raise;end if;end;
 perform public.rewards_streamer_live_api('39780903','cancelPromo',jsonb_build_object('promoId',cid));perform public.rewards_streamer_live_api('39780903','cancelPromo',jsonb_build_object('promoId',cid));
 actual_wallet:=(public.rewards_streamer_live_api('39780903','state')->>'balance')::bigint;
 if actual_wallet<>initial_wallet+100-2*p.sell_price_coins-7 then raise exception 'wallet_mismatch %',actual_wallet;end if;
end $$;
rollback;
select 'PASSED: real inventory, order, sale, coin promo, deduplication, self-reward guard and wallet accounting; all verification changes rolled back' as verification;
