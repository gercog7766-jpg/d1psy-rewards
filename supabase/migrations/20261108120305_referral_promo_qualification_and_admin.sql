create or replace function public.rewards_referral_coin_event() returns trigger language plpgsql security invoker set search_path='' as $$
declare eligible boolean:=false;begin
 if new.amount<=0 or not exists(select 1 from public.rewards_referrals where referred_user_id=new.user_id and signup_bonus_paid_at is null and login_verified_at is not null and new.created_at>=created_at) then return new;end if;
 if new.transaction_type='win_sale' and new.win_id is not null then
 select exists(select 1 from public.rewards_wins w where w.id=new.win_id and w.user_id=new.user_id and w.choice_status='sold' and w.sold_for_coins=new.amount and w.source_type is distinct from 'shop' and (w.round_id is not null or w.source_type='season' or (w.source_type='upgrader' and exists(select 1 from public.rewards_upgrades a where a.reward_win_id=w.id and a.result='won')) or exists(select 1 from public.rewards_promo_redemptions pr where pr.win_id=w.id and pr.user_id=w.user_id) or exists(select 1 from public.rewards_streamer_live_awards a where a.win_id=w.id))) into eligible;
 elsif new.transaction_type='adjustment' and (new.note ~ '^Ежедневный бонус · день [1-7]$' or new.note like 'Промокод %') then eligible:=true;
 elsif new.transaction_type='level_reward' and new.note ~ '^Battle Pass S[0-9]+ · LVL [0-9]+$' then eligible:=true;end if;
 if eligible then update public.rewards_referrals set eligible_earned_coins=eligible_earned_coins+new.amount where referred_user_id=new.user_id and signup_bonus_paid_at is null;perform public.rewards_qualify_referral(new.user_id);end if;
 return new;end $$;
create function public.rewards_referral_admin(p_query text default '',p_page integer default 1) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare total bigint;qualified bigint;items jsonb;begin
 if p_page is null or p_page<1 or p_page>1000000 or p_query is null or length(p_query)>80 then raise exception 'invalid_request';end if;
 with filtered as(select r.* from public.rewards_referrals r join public.rewards_users p on p.id=r.referrer_user_id join public.rewards_users u on u.id=r.referred_user_id where p_query='' or position(lower(p_query) in lower(coalesce(p.twitch_login,'')||' '||coalesce(p.twitch_display_name,'')||' '||coalesce(u.twitch_login,'')||' '||coalesce(u.twitch_display_name,'')))>0)
 select count(*),count(qualified_at) into total,qualified from filtered;
 select coalesce(jsonb_agg(x order by x."createdAt" desc),'[]'::jsonb) into items from (
 select p.twitch_display_name as referrer,p.twitch_login as "referrerLogin",u.twitch_display_name as referred,u.twitch_login as "referredLogin",r.created_at as "createdAt",r.qualified_at as "qualifiedAt",r.eligible_earned_coins as "earnedCoins",r.signup_bonus_coins as "bonusCoins",u.steam_trade_url_valid as "tradeReady",(select coalesce(sum(e.amount_hundredths),0) from public.rewards_referral_events e where e.referrer_user_id=r.referrer_user_id and e.referred_user_id=r.referred_user_id) as "earnedHundredths"
 from public.rewards_referrals r join public.rewards_users p on p.id=r.referrer_user_id join public.rewards_users u on u.id=r.referred_user_id where p_query='' or position(lower(p_query) in lower(coalesce(p.twitch_login,'')||' '||coalesce(p.twitch_display_name,'')||' '||coalesce(u.twitch_login,'')||' '||coalesce(u.twitch_display_name,'')))>0 order by r.created_at desc,r.referred_user_id limit 20 offset ((p_page-1)*20))x;
 return jsonb_build_object('total',total,'qualified',qualified,'pages',greatest(1,(total+19)/20),'page',p_page,'items',items);
end $$;
revoke all on function public.rewards_referral_admin(text,integer) from public,anon,authenticated;
grant execute on function public.rewards_referral_admin(text,integer) to service_role;
