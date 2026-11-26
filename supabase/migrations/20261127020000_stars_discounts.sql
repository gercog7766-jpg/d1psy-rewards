-- Closed verified subscription discounts. Existing orders retain their original prices.
create function public.rewards_stars_discount_percent(p_user uuid,p_kind text) returns int
language sql stable security invoker set search_path='' as $$
 select case public.rewards_stars_gift_tier(p_user) when 'lite' then case p_kind when 'shop' then 1 when 'battlePass' then 2 when 'cosmetics' then 10 else 0 end when 'plus' then case p_kind when 'shop' then 2 when 'battlePass' then 5 when 'cosmetics' then 20 else 0 end else 0 end;
$$;
revoke all on function public.rewards_stars_discount_percent(uuid,text) from public,anon,authenticated;
grant execute on function public.rewards_stars_discount_percent(uuid,text) to service_role;
create function public.rewards_stars_coin_price(p_user uuid,p_kind text,p_base int) returns int
language sql stable security invoker set search_path='' as $$
 select p_base-((p_base::bigint*public.rewards_stars_discount_percent(p_user,p_kind))/100)::int;
$$;
revoke all on function public.rewards_stars_coin_price(uuid,text,int) from public,anon,authenticated;
grant execute on function public.rewards_stars_coin_price(uuid,text,int) to service_role;

alter table public.rewards_stars_pilot_orders add column base_stars int check(base_stars is null or base_stars between 1 and 100000),add column discount_percent int not null default 0 check(discount_percent in(0,2,5)),add constraint rewards_stars_discount_price_check check(base_stars is null or stars<=base_stars);
create function public.rewards_stars_order_discount() returns trigger language plpgsql security invoker set search_path='' as $$
declare payer uuid;
begin
 new.base_stars:=new.stars;new.discount_percent:=0;
 if new.product='battlePass' then
  select id into payer from public.rewards_users where twitch_user_id=new.actor and not coalesce(banned,false);
  if payer is not null then new.discount_percent:=public.rewards_stars_discount_percent(payer,'battlePass');end if;
  new.stars:=greatest(1,round(new.base_stars*(100-new.discount_percent)/100.0)::int);
 end if;
 return new;
end $$;
revoke all on function public.rewards_stars_order_discount() from public,anon,authenticated;
grant execute on function public.rewards_stars_order_discount() to service_role;
create trigger rewards_stars_order_discount before insert on public.rewards_stars_pilot_orders for each row execute function public.rewards_stars_order_discount();

-- Preserve the existing wallet lock, ownership, replay and permanent purchase logic.
do $$
declare definition text; old_guard text:='if balance<item.price then raise exception ''insufficient_coins'';end if;';old_debit text:='values(me.id,-item.price,''shop_purchase''';old_catalog text:='''price'',c.price,''owned''';
begin
 select pg_get_functiondef('public.rewards_profile_customization(text,text,jsonb)'::regprocedure) into definition;
 if strpos(definition,old_guard)=0 or strpos(definition,old_debit)=0 or strpos(definition,old_catalog)=0 then raise exception 'unexpected_profile_customization_definition';end if;
 definition:=replace(definition,old_guard,'if p_body?''expectedPrice'' and (p_body->>''expectedPrice'')::int is distinct from public.rewards_stars_coin_price(me.id,''cosmetics'',item.price) then raise exception ''price_changed'';end if; if balance<public.rewards_stars_coin_price(me.id,''cosmetics'',item.price) then raise exception ''insufficient_coins'';end if;');
 definition:=replace(definition,old_debit,'values(me.id,-public.rewards_stars_coin_price(me.id,''cosmetics'',item.price),''shop_purchase''');
 definition:=replace(definition,old_catalog,'''price'',public.rewards_stars_coin_price(me.id,''cosmetics'',c.price),''basePrice'',c.price,''owned''');
 execute definition;
end $$;
notify pgrst,'reload schema';
