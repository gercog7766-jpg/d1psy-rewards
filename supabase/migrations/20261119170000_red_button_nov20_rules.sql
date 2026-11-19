-- Apply new Red Button rules to rounds dated 20 November 2026 or later (Moscow).
-- Preserve the original conditions and settlement of all earlier rounds.
create or replace function public.rewards_red_button(p_actor text,p_round uuid default null,p_request uuid default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
  player public.rewards_users;
  game public.rewards_red_button_rounds;
  member public.rewards_red_button_members;
  prior public.rewards_red_button_holds;
  stamp timestamptz;
  can_play boolean;
  entry_cost integer;
  cooldown_minutes integer;
begin
  select * into player from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false);
  if not found then raise exception 'user_unavailable'; end if;
  can_play := not coalesce(player.participation_restricted,false);
  perform public.rewards_red_button_tick();
  if p_round is not null then
    if not can_play then raise exception 'user_unavailable'; end if;
    if p_request is null then raise exception 'invalid_request'; end if;
    select * into game from public.rewards_red_button_rounds where id=p_round for update;
    if game.id is null then raise exception 'round_closed'; end if;
    select * into prior from public.rewards_red_button_holds where request_id=p_request;
    if prior.request_id is not null and (prior.round_id<>p_round or prior.user_id<>player.id) then
      raise exception 'invalid_request';
    end if;
    if prior.request_id is null then
      select * into member from public.rewards_red_button_members where round_id=game.id and user_id=player.id;
      perform 1 from public.rewards_users where id=player.id and not banned and not participation_restricted for update;
      if not found then raise exception 'user_unavailable'; end if;
      stamp := clock_timestamp();
      if game.closed_at is not null or stamp>=game.ends_at then raise exception 'round_closed'; end if;
      if game.holder=player.id then raise exception 'already_holding'; end if;
      entry_cost:=case when game.day>=date '2026-11-20' then 20 else 10 end;
      cooldown_minutes:=case when game.day>=date '2026-11-20' then 60 else 20 end;
      if stamp<member.last_press+make_interval(mins=>cooldown_minutes) then raise exception 'cooldown'; end if;
      if member.user_id is null then
        if (select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=player.id)<entry_cost then
          raise exception 'insufficient_coins';
        end if;
        insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
          values(player.id,-entry_cost,'adjustment','Красная кнопка · вход · '||game.id);
      end if;
      insert into public.rewards_red_button_members(round_id,user_id,last_press) values(game.id,player.id,stamp)
        on conflict(round_id,user_id) do update set last_press=excluded.last_press;
      update public.rewards_red_button_holds set ended_at=stamp where round_id=game.id and ended_at is null;
      insert into public.rewards_red_button_holds(request_id,round_id,user_id,started_at)
        values(p_request,game.id,player.id,stamp);
      update public.rewards_red_button_rounds set holder=player.id,held_since=stamp where id=game.id;
    end if;
  end if;
  select * into game from public.rewards_red_button_rounds where day=(clock_timestamp() at time zone 'Europe/Moscow')::date;
  select * into member from public.rewards_red_button_members where round_id=game.id and user_id=player.id;

  entry_cost:=case when coalesce(game.day,(clock_timestamp() at time zone 'Europe/Moscow')::date)>=date '2026-11-20' then 20 else 10 end;
  cooldown_minutes:=case when coalesce(game.day,(clock_timestamp() at time zone 'Europe/Moscow')::date)>=date '2026-11-20' then 60 else 20 end;
  return jsonb_build_object('now',clock_timestamp(),'canPlay',can_play,
    'rules',jsonb_build_object('entryCost',entry_cost,'cooldownMinutes',cooldown_minutes,'prizeMin',50,'prizeMax',case when cooldown_minutes=60 then 200 else 300 end),
    'round',case when game.id is not null then jsonb_build_object(
      'id',game.id,'endsAt',game.ends_at,'prize',game.prize_name,'image',game.image_url,'wear',game.wear,'price',game.price,
      'playerCount',(select count(*) from public.rewards_red_button_members m where m.round_id=game.id),
      'holder',(select coalesce(nullif(twitch_display_name,''),twitch_login) from public.rewards_users where id=game.holder),
      'holding',coalesce(game.holder=player.id,false),'joined',member.user_id is not null,
      'readyAt',member.last_press+make_interval(mins=>cooldown_minutes)) end,
    'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.day desc),'[]'::jsonb) from (
      select r.day,coalesce(nullif(u.twitch_display_name,''),u.twitch_login) nick,r.prize_name as skin,r.winning_ms as duration
      from public.rewards_red_button_rounds r join public.rewards_users u on u.id=r.winner
      where r.closed_at is not null order by r.day desc limit 20
    ) h));
end;
$$;

create or replace function public.rewards_red_button_tick() returns void
language plpgsql set search_path = '' as $$
declare
  today date := (clock_timestamp() at time zone 'Europe/Moscow')::date;
  game public.rewards_red_button_rounds;
  best record;
  prize record;
  previous_name text;
  prize_id uuid;
  awarded uuid;
begin
  if exists(select 1 from public.rewards_red_button_rounds where day=today)
    and not exists(select 1 from public.rewards_red_button_rounds where closed_at is null and ends_at<=clock_timestamp())
    then return; end if;
  perform pg_advisory_xact_lock(519701322070::bigint);
  for game in select * from public.rewards_red_button_rounds where closed_at is null and ends_at<=clock_timestamp()
    order by day for update
  loop
    update public.rewards_red_button_holds set ended_at=game.ends_at where round_id=game.id and ended_at is null;
    select h.user_id, sum(h.ended_at-h.started_at) as total_hold into best
      from public.rewards_red_button_holds h join public.rewards_users u on u.id=h.user_id
      where h.round_id=game.id and not coalesce(u.banned,false) and not coalesce(u.participation_restricted,false)
      group by h.user_id
      order by total_hold desc,min(h.started_at),h.user_id limit 1;
    awarded := null;
    if best.user_id is not null then
      insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
        values(game.prize_name,game.image_url,'disabled',true,1,game.price) returning id into prize_id;
      insert into public.rewards_wins(user_id,prize_id,source_type,delivery_status,choice_status,item_wear,item_variant_kind)
        values(best.user_id,prize_id,'red_button','awaiting_choice','awaiting_choice',game.wear,game.variant_kind) returning id into awarded;
    end if;
    update public.rewards_red_button_rounds set closed_at=clock_timestamp(),winner=best.user_id,win_id=awarded,
      winning_ms=(extract(epoch from best.total_hold)*1000)::bigint where id=game.id;
  end loop;

  if exists(select 1 from public.rewards_red_button_rounds where day=today) then return; end if;
  select prize_name into previous_name from public.rewards_red_button_rounds order by day desc limit 1;
  select offers.* into prize from (
    select case v.variant_kind when 'stattrak' then 'StatTrak™ ' when 'souvenir' then 'Сувенирный ' else '' end || i.name as name,
      i.image_url,v.wear,v.variant_kind,v.price_coins as price
      from public.rewards_shop_item_variants v join public.rewards_shop_items i on i.id=v.shop_item_id
      where v.price_coins between 50 and (case when today>=date '2026-11-20' then 200 else 300 end) and v.available and i.status='available'
        and (i.stock is null or i.stock>0) and nullif(i.image_url,'') is not null
  ) offers where offers.name is distinct from previous_name order by gen_random_uuid() limit 1;
  if not found then return; end if;
  insert into public.rewards_red_button_rounds(day,starts_at,ends_at,prize_name,image_url,wear,variant_kind,price)
    values(today,case when previous_name is null then clock_timestamp() else today::timestamp at time zone 'Europe/Moscow' end,
      (today+1)::timestamp at time zone 'Europe/Moscow',prize.name,prize.image_url,prize.wear,prize.variant_kind,prize.price);
end;
$$;

notify pgrst,'reload schema';

