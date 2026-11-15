-- Retain the original terms for attempts already purchased and for the previous
-- application release while the VPS is building the new one.
alter table public.rewards_three_doors_attempts
  drop constraint rewards_three_doors_attempts_stake_check,
  add constraint rewards_three_doors_attempts_stake_check
    check (stake in (10,15,20,25,50,75,100,150,200,250,500)),
  add column prize_price integer check (prize_price > 0),
  add column sale_price integer check (sale_price > 0);
update public.rewards_three_doors_attempts
  set prize_price = stake * 2, sale_price = stake * 130 / 100;
alter table public.rewards_three_doors_attempts
  alter column prize_price set not null,
  alter column sale_price set not null;

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
      if balance < p_stake then raise exception 'insufficient_coins'; end if;
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
      insert into public.rewards_coin_transactions (user_id,amount,transaction_type,note)
      values (player.id,-p_stake,'adjustment','Три двери · вход · ' || attempt.id);
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
  else
    balance := balance - p_stake;
  end if;
  return jsonb_build_object(
    'balance', balance, 'canPlay', can_play, 'serverNow', current_time_at,
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
