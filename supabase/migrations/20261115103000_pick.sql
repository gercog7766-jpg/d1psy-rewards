create table public.rewards_pick_attempts (
  id uuid primary key,
  user_id uuid not null references public.rewards_users(id),
  started_at timestamptz not null default clock_timestamp(),
  cards jsonb not null check (jsonb_typeof(cards) = 'array' and jsonb_array_length(cards) = 5),
  chosen integer check (chosen between 1 and 5),
  win_id uuid references public.rewards_wins(id),
  check ((chosen is null) = (win_id is null))
);
create index rewards_pick_user_started_idx on public.rewards_pick_attempts(user_id, started_at desc);
alter table public.rewards_pick_attempts enable row level security;
revoke all on public.rewards_pick_attempts from public, anon, authenticated;
grant select, insert, update on public.rewards_pick_attempts to service_role;

create function public.rewards_pick(p_actor text, p_action text, p_id uuid default null, p_value integer default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
  player public.rewards_users%rowtype;
  attempt public.rewards_pick_attempts%rowtype;
  quoted_prices integer[];
  deck jsonb;
  picked jsonb;
  prize_id uuid;
  awarded_win_id uuid;
  balance bigint;
  can_play boolean;
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

  if p_action = 'start' and p_id is null then raise exception 'invalid_request'; end if;
  if p_action = 'state' or (p_action = 'start' and attempt.id is distinct from p_id) then
    with catalog as materialized (
      select i.name, i.image_url, v.wear, v.variant_kind, v.price_coins as price
      from public.rewards_shop_item_variants v join public.rewards_shop_items i on i.id = v.shop_item_id
      where v.available and i.status = 'available' and (i.stock is null or i.stock > 0)
        and v.price_coins in (7,10,15,25,50,100)
      union all
      select i.name, i.image_url, null::text, null::text, i.price_coins
      from public.rewards_shop_items i
      where i.status = 'available' and (i.stock is null or i.stock > 0)
        and i.price_coins in (7,10,15,25,50,100)
        and not exists (select 1 from public.rewards_shop_item_variants v where v.shop_item_id = i.id)
    ), tiers as (
      select case when exists(select 1 from catalog where price = 10) then 10 else 7 end as price
      union all select unnest(array[15,25,50,100])
    ), prizes as (
      select c.* from tiers t cross join lateral (
        select * from catalog where price = t.price order by gen_random_uuid() limit 1
      ) c
    )
    select array_agg(price order by price),
      case when p_action = 'start' then jsonb_agg(
        jsonb_build_object('name',case variant_kind when 'stattrak' then 'StatTrak™ ' when 'souvenir' then 'Сувенирный ' else '' end || name,
          'image',image_url,'wear',wear,'kind',variant_kind,'price',price)
        order by gen_random_uuid()) end
      into quoted_prices, deck from prizes;
    if cardinality(quoted_prices) is distinct from 5 then quoted_prices := null; end if;
  end if;

  if p_action = 'start' and attempt.id is distinct from p_id then
    if exists(select 1 from public.rewards_pick_attempts where id = p_id) then raise exception 'invalid_attempt'; end if;
    if attempt.id is not null and attempt.chosen is null then raise exception 'attempt_in_progress'; end if;
    if balance < 50 then raise exception 'insufficient_coins'; end if;
    if quoted_prices is null then raise exception 'prize_unavailable'; end if;
    if p_value is distinct from quoted_prices[1] then raise exception 'quote_changed'; end if;
    insert into public.rewards_pick_attempts(id,user_id,cards) values(p_id,player.id,deck) returning * into attempt;
    insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
      values(player.id,-50,'adjustment','Pick · вход · ' || attempt.id);
    balance := balance - 50;
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

  return jsonb_build_object('balance',balance,'canPlay',can_play,'prices',quoted_prices,
    'attempt',case when attempt.id is not null then jsonb_build_object('id',attempt.id,'chosen',attempt.chosen)
      || case when attempt.chosen is not null then jsonb_build_object('cards',attempt.cards) else '{}'::jsonb end end);
end;
$$;
revoke all on function public.rewards_pick(text,text,uuid,integer) from public, anon, authenticated;
grant execute on function public.rewards_pick(text,text,uuid,integer) to service_role;
