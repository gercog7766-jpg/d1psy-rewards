create or replace function public.rewards_black_box_create(p_start integer,p_step integer,p_hint text,p_prize uuid,p_coins integer) returns uuid
language plpgsql security invoker set search_path='' as $$
declare result_id uuid; reserved_prize uuid; title text; photo text; started timestamptz;
begin
 perform public.rewards_black_box_close();
 if exists(select 1 from public.rewards_black_boxes where closed_at is null) then raise exception 'auction_open'; end if;
 if p_prize is not null then
  select name,image_url into title,photo from public.rewards_prizes where id=p_prize;
  if not found then raise exception 'unknown_prize'; end if;
  insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
  select name,image_url,'disabled',true,1,sell_price_coins from public.rewards_prizes where id=p_prize
  returning id into reserved_prize;
 else
  title:=p_coins||' мон.';
 end if;
 started:=clock_timestamp();
 insert into public.rewards_black_boxes(starts_at,ends_at,start_price,bid_step,hint,prize_id,prize_coins,prize_name,prize_image)
 values(started,started+interval '90 minutes',p_start,p_step,nullif(btrim(p_hint),''),reserved_prize,p_coins,title,photo)
 returning id into result_id;
 return result_id;
end;
$$;
