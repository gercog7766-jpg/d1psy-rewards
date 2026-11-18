alter table public.rewards_promo_codes
  drop constraint rewards_promo_reward_valid,
  add constraint rewards_promo_reward_valid check (
    case reward_type
      when 'coins' then coin_amount is not null and coin_amount > 0 and prize_id is null and reward_amount is null
      when 'prize' then coin_amount is null and prize_id is not null and reward_amount is null
      when 'upgrade_skin' then coin_amount is null and prize_id is not null and reward_amount is null
      when 'major_pass' then coin_amount is null and prize_id is null and reward_amount is null
      when 'vault_keys' then coin_amount is null and prize_id is null and reward_amount is not null and reward_amount between 1 and 10000
      when 'three_doors_pass' then coin_amount is null and prize_id is null and reward_amount is not null and reward_amount in (10,20,50,100,200,500)
      when 'pick_credit' then coin_amount is null and prize_id is null and reward_amount is not null and reward_amount between 1 and 100000
      when 'major_tokens' then coin_amount is null and prize_id is null and reward_amount is not null and reward_amount between 1 and 100000
      else false
    end
  );

create or replace function public.rewards_redeem_owner_promo(p_actor text, p_code text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  promo public.rewards_promo_codes%rowtype;
  player public.rewards_users%rowtype;
  season public.rewards_vault_seasons%rowtype;
  current_at timestamptz;
  week_at date;
  redemption uuid := gen_random_uuid();
  prize uuid;
  win uuid;
begin
  select * into promo from public.rewards_promo_codes
    where lower(code) = lower(trim(p_code)) and active and archived_at is null for update;
  if not found then raise exception 'promo_not_found'; end if;

  -- Vault settlement also takes this lock before locking player rows.
  if promo.reward_type = 'vault_keys' then perform pg_advisory_xact_lock(7268021,1); end if;
  select * into player from public.rewards_users where twitch_user_id = p_actor for update;
  if not found then raise exception 'user_not_found'; end if;
  if coalesce(player.banned,false) or (
    promo.reward_type not in ('coins','prize') and coalesce(player.participation_restricted,false)
  ) then raise exception 'user_unavailable'; end if;
  current_at := clock_timestamp();
  if promo.expires_at <= current_at then raise exception 'expired'; end if;
  if promo.activation_count >= promo.max_activations then raise exception 'limit_reached'; end if;
  if promo.new_users_only and player.created_at <= promo.created_at then raise exception 'new_users_only'; end if;
  if exists(select 1 from public.rewards_promo_redemptions where promo_id=promo.id and user_id=player.id)
    then raise exception 'already_used'; end if;

  case promo.reward_type
    when 'coins' then
      insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
        values(player.id,promo.coin_amount,'adjustment','Промокод ' || promo.code);
    when 'prize', 'upgrade_skin' then
      prize := promo.prize_id;
      if promo.reward_type = 'upgrade_skin' then
        insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
          select name,image_url,'disabled',true,1,sell_price_coins
          from public.rewards_prizes where id=promo.prize_id and sell_price_coins>0
          returning id into prize;
        if not found then raise exception 'invalid_prize'; end if;
      end if;
      insert into public.rewards_wins(user_id,prize_id,won_at,delivery_status,choice_status,source_type)
        values(player.id,prize,current_at,'awaiting_choice','awaiting_choice',
          case when promo.reward_type='upgrade_skin' then 'promo_upgrade' end)
        returning id into win;
    when 'major_pass' then
      if exists(select 1 from public.rewards_major_pickem_entries where user_id=player.id)
        then raise exception 'major_already_active'; end if;
      if not exists(select 1 from public.rewards_major_pickem_stages where open_at<=current_at and current_at<lock_at)
        then raise exception 'major_closed'; end if;
      insert into public.rewards_major_pickem_entries(user_id,paid) values(player.id,0);
    when 'major_tokens' then
      update public.rewards_major_pickem_entries
        set tokens = tokens + promo.reward_amount
        where user_id = player.id;
      if not found then raise exception 'major_pass_required'; end if;
    when 'vault_keys' then
      current_at := public.rewards_vault_now();
      week_at := public.rewards_vault_week(current_at);
      perform public.rewards_vault_ensure(week_at);
      select * into season from public.rewards_vault_seasons where week=week_at for update;
      if not found or season.status <> 'scheduled' or season.settled_at is not null
        or current_at < season.starts_at or current_at >= season.ends_at
        then raise exception 'vault_closed'; end if;
      insert into public.rewards_vault_wallets(week,user_id) values(week_at,player.id)
        on conflict (week,user_id) do nothing;
      update public.rewards_vault_wallets set earned=earned+promo.reward_amount,balance=balance+promo.reward_amount
        where week=week_at and user_id=player.id and earned+promo.reward_amount<=season.key_cap;
      if not found then raise exception 'vault_key_limit'; end if;
      insert into public.rewards_vault_key_ledger(week,user_id,amount,kind,event_key,details)
        values(week_at,player.id,promo.reward_amount,'promo_grant',redemption::text,jsonb_build_object('promoId',promo.id));
      -- The recurring backfill sees this receipt as already handled.
      insert into public.rewards_vault_sources(user_id,kind,event_key,occurred_at,processed_at,week,awarded,reason)
        values(player.id,'promo',redemption::text,current_at,current_at,week_at,0,'direct_grant');
    when 'three_doors_pass', 'pick_credit' then
      insert into public.rewards_promo_game_credits as c(user_id,game,stake,balance)
        values(player.id,
          case when promo.reward_type='pick_credit' then 'pick' else 'three_doors' end,
          case when promo.reward_type='pick_credit' then 0 else promo.reward_amount end,
          case when promo.reward_type='pick_credit' then promo.reward_amount else 1 end)
        on conflict (user_id,game,stake) do update set balance=c.balance+excluded.balance;
  end case;

  insert into public.rewards_promo_redemptions(id,promo_id,user_id,reward_type,coin_amount,prize_id,win_id,reward_amount)
    values(redemption,promo.id,player.id,promo.reward_type,promo.coin_amount,promo.prize_id,win,promo.reward_amount);
  update public.rewards_promo_codes set activation_count=activation_count+1,
    active=activation_count+1<max_activations where id=promo.id;
  return jsonb_build_object('ok',true,'rewardType',promo.reward_type,'amount',coalesce(promo.reward_amount,promo.coin_amount));
end
$$;
revoke all on function public.rewards_redeem_owner_promo(text,text) from public, anon, authenticated;
grant execute on function public.rewards_redeem_owner_promo(text,text) to service_role;

notify pgrst,'reload schema';
