-- Owner promo rewards stay in the same redemption transaction as their activation count.
alter table public.rewards_promo_codes
  add column reward_amount integer,
  drop constraint rewards_promo_codes_reward_type_check,
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
      else false
    end
  );

alter table public.rewards_promo_redemptions add column reward_amount integer;
alter table public.rewards_major_pickem_entries
  drop constraint rewards_major_pickem_entries_paid_check,
  add constraint rewards_major_pickem_entries_paid_check check (paid in (0,250));

create table public.rewards_promo_game_credits (
  user_id uuid not null references public.rewards_users(id),
  game text not null,
  stake integer not null,
  balance bigint not null check (balance >= 0),
  primary key (user_id, game, stake),
  check ((game = 'pick' and stake = 0) or (game = 'three_doors' and stake in (10,20,50,100,200,500)))
);
alter table public.rewards_promo_game_credits enable row level security;
revoke all on public.rewards_promo_game_credits from public, anon, authenticated;
grant select, insert, update on public.rewards_promo_game_credits to service_role;

alter table public.rewards_vault_key_ledger
  drop constraint rewards_vault_key_ledger_kind_check,
  add constraint rewards_vault_key_ledger_kind_check check
    (kind in ('game_day','mission','stream_win','promo','promo_grant','contribution','expiry'));
drop trigger rewards_vault_promo on public.rewards_promo_redemptions;
create trigger rewards_vault_promo after insert on public.rewards_promo_redemptions
  for each row when (new.reward_type <> 'vault_keys') execute function public.rewards_vault_capture();

-- Any cashout, delivery, gift or use outside the upgrader must fail in the database.
create function public.rewards_guard_upgrade_promo_win() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new is not distinct from old then return new; end if;
  if old.choice_status = 'awaiting_choice' and new.choice_status = 'upgraded'
    and (to_jsonb(old) - array['choice_status','choice_at']) = (to_jsonb(new) - array['choice_status','choice_at'])
  then return new; end if;
  raise exception 'upgrade_only';
end
$$;
revoke all on function public.rewards_guard_upgrade_promo_win() from public, anon, authenticated;
grant execute on function public.rewards_guard_upgrade_promo_win() to service_role;
create trigger rewards_guard_upgrade_promo_win before update on public.rewards_wins
  for each row when (old.source_type = 'promo_upgrade') execute function public.rewards_guard_upgrade_promo_win();

create function public.rewards_redeem_owner_promo(p_actor text, p_code text) returns jsonb
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

create or replace function public.rewards_pick(p_actor text, p_action text, p_id uuid default null, p_value integer default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
  player public.rewards_users%rowtype;
  attempt public.rewards_pick_attempts%rowtype;
  quoted_prices integer[];
  deck jsonb;
  preview jsonb;
  catalog_day date := (statement_timestamp() at time zone 'Europe/Berlin')::date;
  picked jsonb;
  prize_id uuid;
  awarded_win_id uuid;
  balance bigint;
  can_play boolean;
  promo_balance bigint;
  promo_used integer;
  wallet_cost integer;
begin
  if p_action is null or p_action not in ('state','start','reveal') then raise exception 'invalid_request'; end if;
  if p_action = 'state' then
    select * into player from public.rewards_users where twitch_user_id = p_actor;
  else
    select * into player from public.rewards_users where twitch_user_id = p_actor for update;
  end if;
  if player.id is null or player.banned then raise exception 'user_unavailable'; end if;
  can_play := not coalesce(player.participation_restricted, false);
  if p_action <> 'state' and not can_play then raise exception 'user_unavailable'; end if;
  select * into attempt from public.rewards_pick_attempts
    where user_id = player.id order by started_at desc limit 1;
  select coalesce(sum(amount), 0) into balance from public.rewards_coin_transactions where user_id = player.id;

  select coalesce((select c.balance from public.rewards_promo_game_credits c
    where c.user_id=player.id and c.game='pick' and c.stake=0),0) into promo_balance;

  if p_action = 'start' and p_id is null then raise exception 'invalid_request'; end if;
  if p_action = 'state' or (p_action = 'start' and attempt.id is distinct from p_id) then
    with catalog as materialized (
      select v.id as catalog_id, i.name, i.image_url, v.wear, v.variant_kind, v.price_coins as price
      from public.rewards_shop_item_variants v join public.rewards_shop_items i on i.id = v.shop_item_id
      where v.available and i.status = 'available' and (i.stock is null or i.stock > 0)
        and v.price_coins in (7,10,15,25,50,100)
      union all
      select i.id as catalog_id, i.name, i.image_url, null::text, null::text, i.price_coins
      from public.rewards_shop_items i
      where i.status = 'available' and (i.stock is null or i.stock > 0)
        and i.price_coins in (7,10,15,25,50,100)
        and not exists (select 1 from public.rewards_shop_item_variants v where v.shop_item_id = i.id)
    ), tiers as (
      select case when exists(select 1 from catalog where price = 10) then 10 else 7 end as price
      union all select unnest(array[15,25,50,100])
    ), prizes as (
      select c.* from tiers t cross join lateral (
        select * from catalog where price = t.price
        order by md5(catalog_day::text || ':' || catalog_id::text), catalog_id limit 1
      ) c
    )
    select array_agg(price order by price),
      case when p_action = 'start' then jsonb_agg(
        jsonb_build_object('name',case variant_kind when 'stattrak' then 'StatTrak™ ' when 'souvenir' then 'Сувенирный ' else '' end || name,
          'image',image_url,'wear',wear,'kind',variant_kind,'price',price,'previewName',name)
        order by gen_random_uuid()) end,
      jsonb_agg(jsonb_build_object('name',name,'image',image_url) order by name,image_url)
      into quoted_prices, deck, preview from prizes;
    if cardinality(quoted_prices) is distinct from 5 then
      quoted_prices := null;
      preview := null;
    end if;
  end if;

  if p_action = 'start' and attempt.id is distinct from p_id then
    if exists(select 1 from public.rewards_pick_attempts where id = p_id) then raise exception 'invalid_attempt'; end if;
    if attempt.id is not null and attempt.chosen is null then raise exception 'attempt_in_progress'; end if;
    promo_used := least(promo_balance,50);
    wallet_cost := 50-promo_used;
    if wallet_cost > 0 and balance < wallet_cost then raise exception 'insufficient_coins'; end if;
    if quoted_prices is null then raise exception 'prize_unavailable'; end if;
    if p_value is distinct from quoted_prices[1] then raise exception 'quote_changed'; end if;
    insert into public.rewards_pick_attempts(id,user_id,cards) values(p_id,player.id,deck) returning * into attempt;
    if promo_used > 0 then
      update public.rewards_promo_game_credits as c set balance=c.balance-promo_used
        where user_id=player.id and game='pick' and stake=0;
      promo_balance := promo_balance-promo_used;
    end if;
    if wallet_cost > 0 then
      insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
        values(player.id,-wallet_cost,'adjustment','Pick · вход · ' || attempt.id);
      balance := balance-wallet_cost;
    end if;
  elsif p_action = 'reveal' then
    if p_id is null or p_id is distinct from attempt.id or p_value is null or p_value not between 1 and 5 then
      raise exception 'invalid_attempt';
    end if;
    if attempt.chosen is null then
      picked := attempt.cards -> (p_value - 1);
      insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
        values(picked->>'name',picked->>'image','disabled',true,1,(picked->>'price')::integer)
        returning id into prize_id;
      insert into public.rewards_wins(round_id,user_id,prize_id,delivery_status,choice_status,item_wear,item_variant_kind,source_type)
        values(null,player.id,prize_id,'awaiting_choice','awaiting_choice',picked->>'wear',picked->>'kind','pick')
        returning id into awarded_win_id;
      update public.rewards_pick_attempts a set chosen = p_value, win_id = awarded_win_id
        where a.id = attempt.id returning a.* into attempt;
    elsif attempt.chosen <> p_value then raise exception 'invalid_attempt';
    end if;
  end if;

  -- The public list has its own alphabetical order and omits prices and wear.
  if attempt.id is not null and (attempt.chosen is null or p_action = 'reveal') then
    select jsonb_agg(jsonb_build_object('name',name,'image',image) order by name,image)
      into preview
      from (select coalesce(card->>'previewName',card->>'name') as name, card->>'image' as image
            from jsonb_array_elements(attempt.cards) as cards(card)) ordered_preview;
  end if;
  return jsonb_build_object('balance',balance,'promoBalance',promo_balance,'canPlay',can_play,'prices',quoted_prices,'preview',preview,
    'attempt',case when attempt.id is not null then jsonb_build_object('id',attempt.id,'chosen',attempt.chosen)
      || case when attempt.chosen is not null then jsonb_build_object('cards',attempt.cards) else '{}'::jsonb end end);
end;
$$;
revoke all on function public.rewards_pick(text,text,uuid,integer) from public, anon, authenticated;
grant execute on function public.rewards_pick(text,text,uuid,integer) to service_role;

create or replace function public.rewards_three_doors(
  p_actor text, p_action text, p_attempt uuid default null,
  p_stake integer default null, p_door integer default null
) returns jsonb language plpgsql set search_path = '' as $$
declare
  player public.rewards_users%rowtype;
  attempt public.rewards_three_doors_attempts%rowtype;
  prize record;
  prize_id uuid;
  new_win uuid;
  draw integer;
  target_price integer;
  revealed integer;
  can_play boolean;
  balance bigint;
  current_time_at timestamptz;
  promo_available boolean;
  promo_stakes jsonb;
begin
  if p_action is null or p_action not in ('state','start','start_v2','pick','finish') then
    raise exception 'invalid_request';
  end if;
  if p_action = 'state' then
    select * into player from public.rewards_users where twitch_user_id = p_actor;
  else
    select * into player from public.rewards_users where twitch_user_id = p_actor for update;
  end if;
  if player.id is null or player.banned then raise exception 'user_unavailable'; end if;
  can_play := not coalesce(player.participation_restricted, false);
  if p_action <> 'state' and not can_play then raise exception 'user_unavailable'; end if;

  select * into attempt from public.rewards_three_doors_attempts
    where user_id = player.id order by started_at desc limit 1;
  current_time_at := clock_timestamp();

  if p_action in ('start','start_v2') then
    if p_attempt is null or p_stake is null
      or (p_action = 'start' and p_stake not in (15,25,50,75,100,150,250))
      or (p_action = 'start_v2' and p_stake not in (10,20,50,100,200,500)) then
      raise exception 'invalid_request';
    end if;
    if attempt.id = p_attempt then
      if attempt.stake <> p_stake then raise exception 'invalid_request'; end if;
    else
      if exists (select 1 from public.rewards_three_doors_attempts where id = p_attempt) then
        raise exception 'invalid_attempt';
      end if;
      if attempt.id is not null and attempt.final_door is null then raise exception 'attempt_in_progress'; end if;
      if current_time_at < attempt.started_at + interval '2 hours' then raise exception 'cooldown'; end if;
      select coalesce(sum(amount), 0) into balance from public.rewards_coin_transactions where user_id = player.id;
      promo_available := exists(select 1 from public.rewards_promo_game_credits c
        where c.user_id=player.id and c.game='three_doors' and c.stake=p_stake and c.balance>0);
      if not promo_available and balance < p_stake then raise exception 'insufficient_coins'; end if;
      target_price := case when p_action = 'start' then p_stake * 2 else p_stake * 13 / 10 end;
      select
        case v.variant_kind when 'stattrak' then 'StatTrak™ ' when 'souvenir' then 'Сувенирный ' else '' end || i.name as name,
        i.image_url, v.wear, v.variant_kind, v.price_coins
      into prize
      from public.rewards_shop_item_variants v
      join public.rewards_shop_items i on i.id = v.shop_item_id
      where (p_action = 'start_v2' or v.price_coins = target_price)
        and v.price_coins > 0 and v.available and i.status = 'available'
        and (i.stock is null or i.stock > 0)
      order by abs(v.price_coins::bigint - target_price), v.price_coins, gen_random_uuid() limit 1;
      if not found then raise exception 'prize_unavailable'; end if;

      -- Take a random UUID nibble outside the version and variant fields.
      -- Reject 15 so each door has exactly five equally likely values.
      loop
        draw := get_byte(uuid_send(gen_random_uuid()), 0) & 15;
        exit when draw < 15;
      end loop;
      insert into public.rewards_three_doors_attempts
        (id,user_id,stake,started_at,prize_name,image_url,wear,variant_kind,prize_door,prize_price,sale_price)
      values (p_attempt,player.id,p_stake,current_time_at,prize.name,prize.image_url,prize.wear,prize.variant_kind,
        1 + draw % 3,prize.price_coins,case when p_action = 'start' then p_stake * 130 / 100 else prize.price_coins end)
      returning * into attempt;
      if promo_available then
        update public.rewards_promo_game_credits as c set balance=c.balance-1
          where c.user_id=player.id and c.game='three_doors' and c.stake=p_stake;
      else
        insert into public.rewards_coin_transactions (user_id,amount,transaction_type,note)
          values (player.id,-p_stake,'adjustment','Три двери · вход · ' || attempt.id);
      end if;
    end if;
  elsif p_action in ('pick','finish') then
    if p_attempt is null or attempt.id is distinct from p_attempt or p_door is null or p_door not between 1 and 3 then
      raise exception 'invalid_attempt';
    end if;
    if p_action = 'pick' then
      if attempt.first_door is null then
        select door into revealed
        from generate_series(1,3) as doors(door)
        where door <> p_door and door <> attempt.prize_door
        order by gen_random_uuid() limit 1;
        update public.rewards_three_doors_attempts
          set first_door = p_door, empty_door = revealed
          where id = attempt.id returning * into attempt;
      elsif attempt.first_door <> p_door then
        raise exception 'invalid_attempt';
      end if;
    elsif attempt.final_door is null then
      if attempt.empty_door is null or attempt.empty_door = p_door then raise exception 'invalid_attempt'; end if;
      if p_door = attempt.prize_door then
        insert into public.rewards_prizes (name,image_url,status,unlimited,draw_weight,sell_price_coins)
        values (attempt.prize_name,attempt.image_url,'disabled',true,1,attempt.sale_price)
        returning id into prize_id;
        insert into public.rewards_wins (round_id,user_id,prize_id,delivery_status,choice_status,item_wear,item_variant_kind,source_type)
        values (null,player.id,prize_id,'awaiting_choice','awaiting_choice',attempt.wear,attempt.variant_kind,'three_doors')
        returning id into new_win;
      end if;
      update public.rewards_three_doors_attempts
        set final_door = p_door, win_id = new_win
        where id = attempt.id returning * into attempt;
    elsif attempt.final_door <> p_door then
      raise exception 'invalid_attempt';
    end if;
  end if;

  if p_action not in ('start','start_v2') or balance is null then
    select coalesce(sum(amount), 0) into balance from public.rewards_coin_transactions where user_id = player.id;
  elsif not promo_available then
    balance := balance - p_stake;
  end if;
  select coalesce(jsonb_object_agg(c.stake,c.balance),'{}'::jsonb) into promo_stakes
    from public.rewards_promo_game_credits c where c.user_id=player.id and c.game='three_doors' and c.balance>0;
  return jsonb_build_object(
    'promoStakes',promo_stakes,'balance', balance, 'canPlay', can_play, 'serverNow', current_time_at,
    'attempt', case when attempt.id is not null then jsonb_build_object(
      'id',attempt.id,'stake',attempt.stake,'nextAt',attempt.started_at + interval '2 hours',
      'prize',jsonb_build_object(
        'name',attempt.prize_name,'image',attempt.image_url,'wear',attempt.wear,
        'price',attempt.prize_price,'sale',attempt.sale_price
      ),
      'firstDoor',attempt.first_door,'emptyDoor',attempt.empty_door,'finalDoor',attempt.final_door
    ) || case when attempt.final_door is not null then
      jsonb_build_object('prizeDoor',attempt.prize_door,'won',attempt.win_id is not null)
    else '{}'::jsonb end end
  );
end;
$$;
revoke all on function public.rewards_three_doors(text,text,uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.rewards_three_doors(text,text,uuid,integer,integer) to service_role;
