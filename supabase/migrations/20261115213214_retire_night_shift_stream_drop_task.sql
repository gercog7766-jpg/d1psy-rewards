-- Retire the weekly drop mission while keeping daily missions and existing rewards.
create or replace function public.rewards_s1_win_trigger() returns trigger
language plpgsql security invoker set search_path = 'public' as $$
begin
  if new.round_id is not null then
    perform public.rewards_season_add_task_progress(new.user_id,'drop_win',1,1,100,public.rewards_s1_day(),true);
  end if;
  if new.source_type='shop' then
    perform public.rewards_season_add_task_progress(new.user_id,'shop_buy',1,1,150,public.rewards_s1_day(),true);
  end if;
  return new;
end;
$$;

create or replace function public.rewards_streamer_live_deliver(
  p_broadcaster text, p_user uuid, p_prize uuid, p_name text, p_cost integer, p_round uuid, p_promo uuid
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  wid uuid;
  cid uuid;
begin
  if p_prize is null then
    insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
      values(p_user,p_cost,'adjustment','Промокод стримера '||p_broadcaster) returning id into cid;
  else
    insert into public.rewards_wins(user_id,prize_id,source_type)
      values(p_user,p_prize,'streamer') returning id into wid;
  end if;
  insert into public.rewards_streamer_live_awards(broadcaster_id,user_id,prize_name,cost,round_id,promo_id,win_id,coin_transaction_id)
    values(p_broadcaster,p_user,p_name,p_cost,p_round,p_promo,wid,cid);
  if p_round is not null then
    perform public.rewards_season_add_task_progress(p_user,'drop_win',1,1,100,public.rewards_s1_day(),true);
    perform public.rewards_award_xp(p_user,20,'Победа в розыгрыше','giveaway_win',wid::text);
    insert into public.rewards_push_jobs(subscription_id,win_id,payload)
      select s.id,wid,jsonb_build_object('title','Тебе выпал дроп!','body',p_name||' — открой инвентарь.','url','/account','tag','drop-'||wid::text)
      from public.rewards_push_subscriptions s join public.rewards_device_sessions d on d.token_hash=s.device_token_hash
      where s.user_id=p_user and d.expires_at>now() and d.hard_expires_at>now()
      on conflict(subscription_id,win_id) do nothing;
  end if;
end;
$$;
