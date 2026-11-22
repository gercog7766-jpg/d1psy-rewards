alter table public.rewards_market_catalog_settings add column max_price integer not null default 500000 check(max_price between 1 and 1000000000);
create or replace function public.rewards_market_catalog_apply(p_items jsonb) returns jsonb language plpgsql set search_path='' as $$
declare cfg public.rewards_market_catalog_settings; g jsonb; v jsonb; item uuid; candidates uuid[]; stamp timestamptz:=clock_timestamp(); n integer:=0; skipped integer:=0; p integer; base_price integer; seen integer:=0; over_limit integer:=0;
begin
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)<500 or jsonb_array_length(p_items)>20000 then raise exception 'incomplete_market_feed';end if;
 perform pg_advisory_xact_lock(78201932);
 select * into cfg from public.rewards_market_catalog_settings where id=1 for update;
 if jsonb_array_length(p_items)<cfg.last_count*0.8 then raise exception 'incomplete_market_feed';end if;
 for g in select value from jsonb_array_elements(p_items) loop
  if nullif(g->>'key','') is null or nullif(g->>'name','') is null or nullif(g->>'english','') is null or g->>'image' not like 'https://%' or jsonb_typeof(g->'variants') is distinct from 'array' or jsonb_array_length(g->'variants')=0 then raise exception 'invalid_catalog_item';end if;
  seen:=seen+jsonb_array_length(g->'variants');
  select id into item from public.rewards_shop_items where market_catalog_key=g->>'key';
  if item is null then
   select array_agg(id) into candidates from public.rewards_shop_items where lower(btrim(trim(leading '★' from name))) in (lower(btrim(trim(leading '★' from g->>'name'))),lower(btrim(trim(leading '★' from g->>'english'))));
   if coalesce(cardinality(candidates),0)>1 then skipped:=skipped+1;continue;end if;
   item:=candidates[1];
   if item is null then
    select min(ceil((x->>'rub')::numeric*(100+cfg.markup)/100))::integer into base_price from jsonb_array_elements(g->'variants') x where ceil((x->>'rub')::numeric*(100+cfg.markup)/100)<=cfg.max_price;
    if base_price is null then over_limit:=over_limit+jsonb_array_length(g->'variants');continue;end if;
    insert into public.rewards_shop_items(name,image_url,price_coins,status,market_catalog_key) values(g->>'name',g->>'image',base_price,'available',g->>'key') returning id into item;
   else update public.rewards_shop_items set market_catalog_key=g->>'key' where id=item and market_catalog_key is null; if not found then skipped:=skipped+1;continue;end if;end if;
  end if;
  if exists(select 1 from public.rewards_shop_items where id=item and market_price_locked) then n:=n+jsonb_array_length(g->'variants');continue;end if;
  for v in select value from jsonb_array_elements(g->'variants') loop
   if v->>'wear' not in ('FN','MW','FT','WW','BS') or v->>'kind' not in ('normal','stattrak','souvenir') or nullif(v->>'hash','') is null or (v->>'rub')::numeric not between 0.01 and 1000000000 then raise exception 'invalid_variant';end if;
   if ceil((v->>'rub')::numeric*(100+cfg.markup)/100)>cfg.max_price then over_limit:=over_limit+1;continue;end if;
   p:=ceil((v->>'rub')::numeric*(100+cfg.markup)/100)::integer;
   insert into public.rewards_shop_item_variants(shop_item_id,wear,variant_kind,stattrak,price_coins,available,market_hash_name,market_rub,market_seen_at)
   values(item,v->>'wear',v->>'kind',v->>'kind'='stattrak',p,true,v->>'hash',(v->>'rub')::numeric,stamp)
   on conflict(shop_item_id,wear,variant_kind) do update set price_coins=excluded.price_coins,available=true,market_hash_name=excluded.market_hash_name,market_rub=excluded.market_rub,market_seen_at=stamp,updated_at=now();
   n:=n+1;
  end loop;
 end loop;
 if seen<2000 then raise exception 'incomplete_market_feed';end if;
 update public.rewards_shop_item_variants v set available=false from public.rewards_shop_items i where v.shop_item_id=i.id and not i.market_price_locked and v.market_hash_name is not null and v.market_seen_at<stamp;
 update public.rewards_shop_items i set price_coins=coalesce((select min(v.price_coins) from public.rewards_shop_item_variants v where v.shop_item_id=i.id and v.available),i.price_coins),updated_at=now() where i.market_catalog_key is not null and not i.market_price_locked;
 update public.rewards_shop_items i set status='hidden',market_unavailable=true where i.market_catalog_key is not null and not i.market_price_locked and i.status='available' and not exists(select 1 from public.rewards_shop_item_variants v where v.shop_item_id=i.id and v.available);
 update public.rewards_shop_items i set status='available',market_unavailable=false where i.market_unavailable and not i.market_price_locked and exists(select 1 from public.rewards_shop_item_variants v where v.shop_item_id=i.id and v.available);
 update public.rewards_market_catalog_settings set last_sync=stamp,last_count=jsonb_array_length(p_items) where id=1;
 return jsonb_build_object('items',jsonb_array_length(p_items),'variants',n,'skipped',skipped,'markup',cfg.markup,'maxPrice',cfg.max_price,'overLimit',over_limit);
end$$;

notify pgrst,'reload schema';
