-- Stage S2 member presale while retaining the existing manual product visibility switch.
-- All timestamps are based on the configured Moscow-midnight season start.
alter table public.rewards_stars_pilot_orders drop constraint rewards_stars_pilot_orders_discount_percent_check;
alter table public.rewards_stars_pilot_orders add constraint rewards_stars_pilot_orders_discount_percent_check check(discount_percent in (0,2,5,15,20));

-- NULL means not eligible; 0 means eligible without a discount.
create function public.rewards_stars_s2_sale_discount(p_actor text,p_season text,p_at timestamptz) returns int
language plpgsql stable security invoker set search_path='' as $$
declare dates public.rewards_stars_seasons; payer uuid; tier text;
begin
 select * into dates from public.rewards_stars_seasons where season=p_season;
 if not found or p_at is null or p_at<dates.starts_at-interval '120 hours' or p_at>=dates.ends_at
  or not public.rewards_s2_live_ready(p_season) then return null;end if;
 select id into payer from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false);
 if payer is null then return null;end if;
 tier:=public.rewards_stars_gift_tier(payer);
 if p_at<dates.starts_at then return case tier when 'lite' then 15 when 'plus' then 20 else null end;end if;
 return case tier when 'lite' then 2 when 'plus' then 5 else 0 end;
end $$;
revoke all on function public.rewards_stars_s2_sale_discount(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.rewards_stars_s2_sale_discount(text,text,timestamptz) to service_role;

create or replace function public.rewards_stars_order_discount() returns trigger
language plpgsql security invoker set search_path='' as $$
declare payer uuid; offer int; visibility text;
begin
 new.base_stars:=new.stars;new.discount_percent:=0;
 if new.product='battlePass' then
  select config->'battlePass'->>'visibility' into visibility from public.rewards_monetization_draft where id;
  if visibility='players' then
   offer:=public.rewards_stars_s2_sale_discount(new.actor,new.season,clock_timestamp());
   if offer is null then raise exception 'season_not_open';end if;
   new.discount_percent:=offer;
  else
   select id into payer from public.rewards_users where twitch_user_id=new.actor and not coalesce(banned,false);
   if payer is not null then new.discount_percent:=public.rewards_stars_discount_percent(payer,'battlePass');end if;
  end if;
  new.stars:=greatest(1,round(new.base_stars*(100-new.discount_percent)/100.0)::int);
 end if;
 return new;
end $$;

create or replace function public.rewards_stars_freeze_season() returns trigger
language plpgsql security invoker set search_path='' as $$
declare visibility text; offer int;
begin
 if new.product='battlePass' and old.state='pending' and new.state='approved' then
  select config->'battlePass'->>'visibility' into visibility from public.rewards_monetization_draft where id;
  if visibility='players' then
   offer:=public.rewards_stars_s2_sale_discount(new.actor,new.season,clock_timestamp());
   if offer is null then raise exception 'season_not_open';end if;
   if offer is distinct from new.discount_percent then raise exception 'price_changed';end if;
   select ends_at into new.season_ends_at from public.rewards_stars_seasons where season=new.season;
  else
   select ends_at into new.season_ends_at from public.rewards_stars_seasons
    where season=new.season and starts_at<=clock_timestamp() and ends_at>clock_timestamp();
  end if;
  if new.season_ends_at is null then raise exception 'season_not_open';end if;
 end if;
 return new;
end $$;

do $migration$
declare definition text:=pg_get_functiondef('public.rewards_stars_pilot_action(text,text,jsonb)'::regprocedure);
 old_create text:=$s$or (cfg->>'visibility'='players' and product_key in ('lite','plus'))$s$;
 old_approve text:=$s$or (config->o.product->>'visibility'='players' and o.product in ('lite','plus'))$s$;
begin
 if strpos(definition,old_create)=0 or strpos(definition,old_approve)=0 then raise exception 'unexpected_stars_checkout_definition';end if;
 definition:=replace(definition,old_create,$s$or (cfg->>'visibility'='players' and (product_key in ('lite','plus') or (product_key='battlePass' and public.rewards_stars_s2_sale_discount(actor_id,cfg->>'season',stamp) is not null)))$s$);
 definition:=replace(definition,old_approve,$s$or (config->o.product->>'visibility'='players' and o.product in ('lite','plus','battlePass'))$s$);
 execute definition;
 definition:=pg_get_functiondef('public.rewards_s2_live_claim(text,text,text,integer)'::regprocedure);
 if strpos(definition,'approved_at>=s.starts_at')=0 then raise exception 'unexpected_s2_claim_definition';end if;
 definition:=replace(definition,'approved_at>=s.starts_at','approved_at>=s.starts_at-interval ''120 hours''');
 execute definition;
end $migration$;
notify pgrst,'reload schema';
