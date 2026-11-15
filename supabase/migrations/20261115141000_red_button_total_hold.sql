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
      where v.price_coins between 50 and 300 and v.available and i.status='available'
        and (i.stock is null or i.stock>0) and nullif(i.image_url,'') is not null
  ) offers where offers.name is distinct from previous_name order by gen_random_uuid() limit 1;
  if not found then return; end if;
  insert into public.rewards_red_button_rounds(day,starts_at,ends_at,prize_name,image_url,wear,variant_kind,price)
    values(today,case when previous_name is null then clock_timestamp() else today::timestamp at time zone 'Europe/Moscow' end,
      (today+1)::timestamp at time zone 'Europe/Moscow',prize.name,prize.image_url,prize.wear,prize.variant_kind,prize.price);
end;
$$;
