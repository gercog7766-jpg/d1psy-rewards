-- PROPOSAL ONLY. Do not apply to production without a coordinated release.
-- Serialize purchases by user before balance reads, including across different items.
-- Existing shop item/variant stock locks remain in place.
CREATE OR REPLACE FUNCTION public.rewards_purchase_shop_item(p_shop_item_id uuid, p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare i public.rewards_shop_items; v_balance integer; v_prize uuid; v_win uuid;
begin
 perform 1 from public.rewards_users where id=p_user_id for update;
 if not found then raise exception 'user_not_found'; end if;
 select * into i from public.rewards_shop_items where id=p_shop_item_id and status='available' for update;
 if i.id is null then raise exception 'item_not_available'; end if;
 select coalesce(sum(amount),0)::integer into v_balance from public.rewards_coin_transactions where user_id=p_user_id;
 if v_balance<i.price_coins then raise exception 'insufficient_coins'; end if;
 if i.stock is not null and i.stock<=0 then raise exception 'out_of_stock'; end if;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user_id,-i.price_coins,'shop_purchase','shop_item:'||i.id::text);
 if i.stock is not null then update public.rewards_shop_items set stock=stock-1,updated_at=now() where id=i.id; end if;
 select id into v_prize from public.rewards_prizes where name=i.name and sell_price_coins=i.price_coins order by created_at desc limit 1;
 if v_prize is null then insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins) values(i.name,i.image_url,'disabled',true,1,i.price_coins) returning id into v_prize; end if;
 insert into public.rewards_wins(round_id,user_id,prize_id,delivery_status,choice_status,won_at,source_type) values(null,p_user_id,v_prize,'awaiting_choice','awaiting_choice',now(),'shop') returning id into v_win;
 return v_win;
end $function$;

CREATE OR REPLACE FUNCTION public.rewards_purchase_shop_item_variant(p_shop_item_id uuid, p_variant_id uuid, p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare i public.rewards_shop_items; v public.rewards_shop_item_variants; v_balance integer; v_prize uuid; v_win uuid; v_name text;
begin
 perform 1 from public.rewards_users where id=p_user_id for update;
 if not found then raise exception 'user_not_found'; end if;
 select * into i from public.rewards_shop_items where id=p_shop_item_id and status='available' for update;
 if i.id is null then raise exception 'item_not_available'; end if;
 select * into v from public.rewards_shop_item_variants where id=p_variant_id and shop_item_id=i.id and available=true for update;
 if v.id is null or v.price_coins is null then raise exception 'variant_not_available'; end if;
 select coalesce(sum(amount),0)::integer into v_balance from public.rewards_coin_transactions where user_id=p_user_id;
 if v_balance<v.price_coins then raise exception 'insufficient_coins'; end if;
 if i.stock is not null and i.stock<=0 then raise exception 'out_of_stock'; end if;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user_id,-v.price_coins,'shop_purchase','shop_item:'||i.id::text||';variant:'||v.id::text);
 if i.stock is not null then update public.rewards_shop_items set stock=stock-1,updated_at=now() where id=i.id; end if;
 v_name:=case when v.variant_kind='stattrak' then 'StatTrak™ ' when v.variant_kind='souvenir' then 'Сувенирный ' else '' end||i.name;
 select id into v_prize from public.rewards_prizes where name=v_name and sell_price_coins=v.price_coins order by created_at desc limit 1;
 if v_prize is null then insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins) values(v_name,i.image_url,'disabled',true,1,v.price_coins) returning id into v_prize; end if;
 insert into public.rewards_wins(round_id,user_id,prize_id,delivery_status,choice_status,won_at,item_wear,item_variant_kind,source_type) values(null,p_user_id,v_prize,'awaiting_choice','awaiting_choice',now(),v.wear,v.variant_kind,'shop') returning id into v_win;
 return v_win;
end $function$;
