-- Token shop rewards have a separate upgrade value, not a sale price.
alter table public.rewards_prizes add column upgrade_value_coins int;
alter table public.rewards_prizes add constraint rewards_prizes_upgrade_only_value
 check(upgrade_value_coins is null or (upgrade_value_coins>0 and coalesce(sell_price_coins,0)=0));

create function public.rewards_major_shop_upgrade_value(p_name text,p_index int) returns int
language sql stable set search_path='' as $$
 select coalesce((select min(q.price) from (
  select v.price_coins as price from public.rewards_shop_items i join public.rewards_shop_item_variants v on v.shop_item_id=i.id
  where i.name=p_name and i.status='available' and v.available and v.variant_kind='normal' and v.price_coins>0
  union all
  select p.sell_price_coins from public.rewards_prizes p
  where p.status='available' and p.sell_price_coins>0 and (p.name=p_name or p.name in(p_name||' FN',p_name||' MW',p_name||' FT',p_name||' WW',p_name||' BS'))
 )q),(array[1,2,3,4,5,10,15,25,40])[p_index+1])
$$;
create function public.rewards_major_shop_set_upgrade_value() returns trigger language plpgsql set search_path='' as $$
begin
 update public.rewards_prizes p set sell_price_coins=0,upgrade_value_coins=public.rewards_major_shop_upgrade_value(p.name,new.item_index)
 from public.rewards_wins w where w.id=new.win_id and w.prize_id=p.id and w.user_id=new.user_id;
 return new;
end$$;
revoke all on function public.rewards_major_shop_upgrade_value(text,int),public.rewards_major_shop_set_upgrade_value() from public,anon,authenticated;
grant execute on function public.rewards_major_shop_upgrade_value(text,int),public.rewards_major_shop_set_upgrade_value() to service_role;
create trigger rewards_major_shop_upgrade_value after insert on public.rewards_major_shop_purchases
 for each row execute function public.rewards_major_shop_set_upgrade_value();
update public.rewards_prizes p set sell_price_coins=0,upgrade_value_coins=public.rewards_major_shop_upgrade_value(p.name,s.item_index)
 from public.rewards_major_shop_purchases s join public.rewards_wins w on w.id=s.win_id and w.user_id=s.user_id
 where p.id=w.prize_id and w.choice_status in('pending','awaiting_choice') and w.delivery_status in('pending','awaiting_choice')
 and w.delivered_at is null;
-- Only an upgrade that spends coins requires available balance.

CREATE OR REPLACE FUNCTION public.rewards_run_skin_upgrade(p_user_id uuid, p_source_win_id uuid, p_target_shop_item_id uuid, p_target_variant_id uuid, p_extra_coins integer)
 RETURNS TABLE(upgrade_id uuid, result text, chance_bps integer, roll_bps integer, reward_win_id uuid)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
 v_source record; v_item record; v_variant record; v_chance integer; v_roll integer; v_upgrade uuid; v_prize uuid; v_reward uuid; v_target_name text; v_balance bigint; v_extra integer:=coalesce(p_extra_coins,0);
begin
 if v_extra<0 then raise exception 'invalid_extra_coins'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select w.id,w.choice_status,w.delivery_status,p.name,p.image_url,coalesce(p.upgrade_value_coins,p.sell_price_coins) as sell_price_coins
 into v_source from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id
 where w.id=p_source_win_id and w.user_id=p_user_id for update of w;
 if not found then raise exception 'source_not_found'; end if;
 if v_source.choice_status not in ('pending','awaiting_choice') or v_source.delivery_status not in ('pending','awaiting_choice') then raise exception 'source_not_available'; end if;
 if coalesce(v_source.sell_price_coins,0)<=0 then raise exception 'source_has_no_value'; end if;
 if exists(select 1 from public.rewards_upgrades where source_win_id=p_source_win_id) then raise exception 'source_already_used'; end if;
 select * into v_item from public.rewards_shop_items where id=p_target_shop_item_id and status='available';
 if not found then raise exception 'target_not_available'; end if;
 select * into v_variant from public.rewards_shop_item_variants where id=p_target_variant_id and shop_item_id=p_target_shop_item_id and available=true and price_coins is not null;
 if not found then raise exception 'target_variant_not_available'; end if;
 if v_variant.price_coins<=v_source.sell_price_coins then raise exception 'target_must_be_more_expensive'; end if;
 select coalesce(sum(amount),0) into v_balance from public.rewards_coin_transactions where user_id=p_user_id;
 if v_extra>0 and v_extra>v_balance then raise exception 'insufficient_coins'; end if;
 v_chance:=least(8500,floor(((v_source.sell_price_coins+v_extra)::numeric/v_variant.price_coins::numeric)*10000*0.90)::integer);
 if v_chance<1 then raise exception 'chance_too_low'; end if;
 v_roll:=floor(random()*10000)::integer;
 v_target_name:=case when v_variant.variant_kind='stattrak' then 'StatTrak™ ' when v_variant.variant_kind='souvenir' then 'Сувенирный ' else '' end||v_item.name;
 if v_extra>0 then
   insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user_id,-v_extra,'adjustment','Доплата монет в апгрейдере');
 end if;
 update public.rewards_wins set choice_status='upgraded',choice_at=now() where id=p_source_win_id;
 insert into public.rewards_upgrades(user_id,source_win_id,target_shop_item_id,target_shop_variant_id,source_value_coins,target_value_coins,chance_bps,roll_bps,result,source_name,target_name,extra_coins)
 values(p_user_id,p_source_win_id,p_target_shop_item_id,p_target_variant_id,v_source.sell_price_coins,v_variant.price_coins,v_chance,v_roll,case when v_roll<v_chance then 'won' else 'lost' end,v_source.name,v_target_name,v_extra)
 returning id into v_upgrade;
 if v_roll<v_chance then
   select id into v_prize from public.rewards_prizes where name=v_target_name and sell_price_coins=v_variant.price_coins order by created_at desc limit 1;
   if v_prize is null then
     insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins) values(v_target_name,v_item.image_url,'disabled',true,1,v_variant.price_coins) returning id into v_prize;
   end if;
   insert into public.rewards_wins(round_id,user_id,prize_id,delivery_status,choice_status,won_at,item_wear,item_variant_kind,source_type)
   values(null,p_user_id,v_prize,'pending','awaiting_choice',now(),v_variant.wear,v_variant.variant_kind,'upgrader') returning id into v_reward;
   update public.rewards_upgrades set reward_win_id=v_reward where id=v_upgrade;
 end if;
 return query select v_upgrade,case when v_roll<v_chance then 'won' else 'lost' end,v_chance,v_roll,v_reward;
end $function$;

CREATE OR REPLACE FUNCTION public.rewards_run_skin_upgrade_multi(p_user_id uuid, p_source_win_ids uuid[], p_target_shop_item_ids uuid[], p_target_variant_ids uuid[], p_extra_coins integer DEFAULT 0)
 RETURNS TABLE(upgrade_id uuid, result text, chance_bps integer, roll_bps integer, reward_win_id uuid)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
 v_source_total bigint:=0; v_target_total bigint:=0; v_extra integer:=coalesce(p_extra_coins,0); v_balance bigint; v_chance integer; v_roll integer; v_upgrade uuid; v_reward uuid; v_prize uuid; v_i integer; v_w record; v_item record; v_variant record; v_target_names text:=''; v_source_names text:=''; v_first_source uuid; v_first_item uuid; v_first_variant uuid; v_target_name text;
begin
 if p_source_win_ids is null or cardinality(p_source_win_ids)<1 or cardinality(p_source_win_ids)>4 then raise exception 'invalid_source_count'; end if;
 if p_target_variant_ids is null or cardinality(p_target_variant_ids)<1 or cardinality(p_target_variant_ids)>4 or cardinality(p_target_shop_item_ids)<>cardinality(p_target_variant_ids) then raise exception 'invalid_target_count'; end if;
 if cardinality(array(select distinct x from unnest(p_source_win_ids) x))<>cardinality(p_source_win_ids) then raise exception 'duplicate_source'; end if;
 if cardinality(array(select distinct x from unnest(p_target_variant_ids) x))<>cardinality(p_target_variant_ids) then raise exception 'duplicate_target'; end if;
 if v_extra<0 then raise exception 'invalid_extra_coins'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 foreach v_first_source in array p_source_win_ids loop
  select w.id,w.choice_status,w.delivery_status,p.name,coalesce(p.upgrade_value_coins,p.sell_price_coins) as sell_price_coins into v_w from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id where w.id=v_first_source and w.user_id=p_user_id for update of w;
  if not found then raise exception 'source_not_found'; end if;
  if v_w.choice_status not in ('pending','awaiting_choice') or v_w.delivery_status not in ('pending','awaiting_choice') then raise exception 'source_not_available'; end if;
  if coalesce(v_w.sell_price_coins,0)<=0 then raise exception 'source_has_no_value'; end if;
  if exists(select 1 from public.rewards_upgrades where source_win_id=v_first_source) then raise exception 'source_already_used'; end if;
  v_source_total:=v_source_total+v_w.sell_price_coins; v_source_names:=concat_ws(' + ',nullif(v_source_names,''),v_w.name);
 end loop;
 for v_i in 1..cardinality(p_target_variant_ids) loop
  select * into v_item from public.rewards_shop_items where id=p_target_shop_item_ids[v_i] and status='available'; if not found then raise exception 'target_not_available'; end if;
  select * into v_variant from public.rewards_shop_item_variants where id=p_target_variant_ids[v_i] and shop_item_id=p_target_shop_item_ids[v_i] and available=true and price_coins is not null; if not found then raise exception 'target_variant_not_available'; end if;
  v_target_total:=v_target_total+v_variant.price_coins; v_target_name:=case when v_variant.variant_kind='stattrak' then 'StatTrak™ ' when v_variant.variant_kind='souvenir' then 'Сувенирный ' else '' end||v_item.name; v_target_names:=concat_ws(' + ',nullif(v_target_names,''),v_target_name);
 end loop;
 if v_target_total<=v_source_total then raise exception 'target_must_be_more_expensive'; end if;
 select coalesce(sum(amount),0) into v_balance from public.rewards_coin_transactions where user_id=p_user_id; if v_extra>0 and v_extra>v_balance then raise exception 'insufficient_coins'; end if;
 v_chance:=least(8500,floor(((v_source_total+v_extra)::numeric/v_target_total::numeric)*10000*0.90)::integer); if v_chance<1 then raise exception 'chance_too_low'; end if; v_roll:=floor(random()*10000)::integer;
 if v_extra>0 then insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user_id,-v_extra,'adjustment','Доплата монет в мульти-апгрейдере'); end if;
 update public.rewards_wins set choice_status='upgraded',choice_at=now() where id=any(p_source_win_ids) and user_id=p_user_id;
 v_first_source:=p_source_win_ids[1]; v_first_item:=p_target_shop_item_ids[1]; v_first_variant:=p_target_variant_ids[1];
 insert into public.rewards_upgrades(user_id,source_win_id,target_shop_item_id,target_shop_variant_id,source_value_coins,target_value_coins,chance_bps,roll_bps,result,source_name,target_name,extra_coins)
 values(p_user_id,v_first_source,v_first_item,v_first_variant,v_source_total,v_target_total,v_chance,v_roll,case when v_roll<v_chance then 'won' else 'lost' end,v_source_names,v_target_names,v_extra) returning id into v_upgrade;
 if v_roll<v_chance then
  for v_i in 1..cardinality(p_target_variant_ids) loop
   select * into v_item from public.rewards_shop_items where id=p_target_shop_item_ids[v_i]; select * into v_variant from public.rewards_shop_item_variants where id=p_target_variant_ids[v_i]; v_target_name:=case when v_variant.variant_kind='stattrak' then 'StatTrak™ ' when v_variant.variant_kind='souvenir' then 'Сувенирный ' else '' end||v_item.name;
   select id into v_prize from public.rewards_prizes where name=v_target_name and sell_price_coins=v_variant.price_coins order by created_at desc limit 1;
   if v_prize is null then insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins) values(v_target_name,v_item.image_url,'disabled',true,1,v_variant.price_coins) returning id into v_prize; end if;
   insert into public.rewards_wins(round_id,user_id,prize_id,delivery_status,choice_status,won_at,item_wear,item_variant_kind,source_type) values(null,p_user_id,v_prize,'pending','awaiting_choice',now(),v_variant.wear,v_variant.variant_kind,'upgrader') returning id into v_reward;
  end loop;
  update public.rewards_upgrades set reward_win_id=v_reward where id=v_upgrade;
 end if;
 return query select v_upgrade,case when v_roll<v_chance then 'won' else 'lost' end,v_chance,v_roll,v_reward;
end $function$;
notify pgrst,'reload schema';
