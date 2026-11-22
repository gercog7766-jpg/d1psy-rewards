-- Avoid thousands of per-item statements. All changes still commit together.
select pg_advisory_xact_lock(78201932);
create or replace function public.rewards_market_catalog_apply(p_items jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare cfg public.rewards_market_catalog_settings; stamp timestamptz:=clock_timestamp(); n integer; skipped integer; over_limit integer; seen integer;
begin
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)<500 or jsonb_array_length(p_items)>20000 then raise exception 'incomplete_market_feed';end if;
 perform pg_advisory_xact_lock(78201932);
 select * into cfg from public.rewards_market_catalog_settings where id=1 for update;
 if jsonb_array_length(p_items)<cfg.last_count*0.8 then raise exception 'incomplete_market_feed';end if;
 if exists(select 1 from jsonb_array_elements(p_items) g where nullif(g->>'key','') is null or nullif(g->>'name','') is null or nullif(g->>'english','') is null or coalesce(g->>'image','') not like 'https://%' or jsonb_typeof(g->'variants') is distinct from 'array') then raise exception 'invalid_catalog_item';end if;
 create temporary table market_import_groups on commit drop as select g->>'key' as key,g->>'name' as name,g->>'english' as english,g->>'image' as image,g->'variants' as variants from jsonb_array_elements(p_items) g;
 create unique index on pg_temp.market_import_groups(key);
 analyze pg_temp.market_import_groups;
 if exists(select 1 from pg_temp.market_import_groups where jsonb_array_length(variants)=0) then raise exception 'invalid_catalog_item';end if;
 create temporary table market_import_variants on commit drop as
 select g.key,v->>'wear' as wear,v->>'kind' as kind,v->>'hash' as hash,(v->>'rub')::numeric as rub,greatest(5,ceil((v->>'rub')::numeric*(100+cfg.markup)/100)) as price
 from pg_temp.market_import_groups g cross join lateral jsonb_array_elements(g.variants) v;
 if exists(select 1 from pg_temp.market_import_variants where wear is null or wear not in ('FN','MW','FT','WW','BS') or kind is null or kind not in ('normal','stattrak','souvenir') or nullif(hash,'') is null or rub is null or rub not between 0.01 and 1000000000) then raise exception 'invalid_variant';end if;
 select count(*),count(*) filter(where price>cfg.max_price) into seen,over_limit from pg_temp.market_import_variants;
 if seen<2000 then raise exception 'incomplete_market_feed';end if;
 create unique index on pg_temp.market_import_variants(key,wear,kind);
 create unique index on pg_temp.market_import_variants(hash);
 analyze pg_temp.market_import_variants;
 -- Match the existing stable key first, then exact normalized localized/English names.
 create temporary table market_import_matches on commit drop as
 with names as (select key,lower(btrim(trim(leading '★' from name))) as normalized from pg_temp.market_import_groups union select key,lower(btrim(trim(leading '★' from english))) from pg_temp.market_import_groups),
 candidates as (select n.key,array_agg(distinct i.id) as ids from names n join public.rewards_shop_items i on lower(btrim(trim(leading '★' from i.name)))=n.normalized group by n.key)
 select g.key,coalesce(k.id,case when cardinality(c.ids)=1 then c.ids[1] end) as item_id,
 (k.id is null and coalesce(cardinality(c.ids),0)>1) as ambiguous
 from pg_temp.market_import_groups g left join public.rewards_shop_items k on k.market_catalog_key=g.key left join candidates c on c.key=g.key;
 create index on pg_temp.market_import_matches(item_id);
 create unique index on pg_temp.market_import_matches(key);
 analyze pg_temp.market_import_matches;
 -- Ambiguous or already mapped to another skin: never overwrite a manual product.
 update pg_temp.market_import_matches m set ambiguous=true where item_id is not null and (exists(select 1 from public.rewards_shop_items i where i.id=m.item_id and i.market_catalog_key is not null and i.market_catalog_key<>m.key) or exists(select 1 from pg_temp.market_import_matches other where other.item_id=m.item_id and other.key<>m.key));
 select count(*) into skipped from pg_temp.market_import_matches where ambiguous;
 update public.rewards_shop_items i set market_catalog_key=m.key from pg_temp.market_import_matches m where i.id=m.item_id and not m.ambiguous and i.market_catalog_key is null;
 insert into public.rewards_shop_items(name,image_url,price_coins,status,market_catalog_key)
 select g.name,g.image,p.price::integer,'available',g.key from pg_temp.market_import_groups g join pg_temp.market_import_matches m on m.key=g.key
 join (select key,min(price) price from pg_temp.market_import_variants where price<=cfg.max_price group by key) p on p.key=g.key
 where m.item_id is null and not m.ambiguous on conflict(market_catalog_key) do nothing;
 insert into public.rewards_shop_item_variants(shop_item_id,wear,variant_kind,stattrak,price_coins,available,market_hash_name,market_rub,market_seen_at)
 select i.id,v.wear,v.kind,v.kind='stattrak',v.price::integer,true,v.hash,v.rub,stamp from pg_temp.market_import_variants v
 join public.rewards_shop_items i on i.market_catalog_key=v.key where v.price<=cfg.max_price and not i.market_price_locked
 on conflict(shop_item_id,wear,variant_kind) do update set price_coins=excluded.price_coins,available=true,market_hash_name=excluded.market_hash_name,market_rub=excluded.market_rub,market_seen_at=stamp,updated_at=now();
 get diagnostics n=row_count;
 update public.rewards_shop_item_variants v set available=false from public.rewards_shop_items i where v.shop_item_id=i.id and not i.market_price_locked and v.market_hash_name is not null and v.market_seen_at<stamp and v.available;
 update public.rewards_shop_items i set price_coins=p.price,updated_at=now() from (select shop_item_id,min(price_coins) price from public.rewards_shop_item_variants where available group by shop_item_id) p where i.id=p.shop_item_id and i.market_catalog_key is not null and not i.market_price_locked and i.price_coins is distinct from p.price;
 update public.rewards_shop_items i set status='hidden',market_unavailable=true where i.market_catalog_key is not null and not i.market_price_locked and i.status='available' and not exists(select 1 from public.rewards_shop_item_variants v where v.shop_item_id=i.id and v.available);
 update public.rewards_shop_items i set status='available',market_unavailable=false where i.market_unavailable and not i.market_price_locked and exists(select 1 from public.rewards_shop_item_variants v where v.shop_item_id=i.id and v.available);
 update public.rewards_market_catalog_settings set last_sync=stamp,last_count=jsonb_array_length(p_items) where id=1;
 return jsonb_build_object('items',jsonb_array_length(p_items),'variants',n,'skipped',skipped,'markup',cfg.markup,'maxPrice',cfg.max_price,'overLimit',over_limit);
end$$;
-- Raise existing imported prices without changing purchase history or inventories.
update public.rewards_shop_item_variants v set price_coins=5,updated_at=now()
from public.rewards_shop_items i where i.id=v.shop_item_id and v.market_hash_name is not null and not i.market_price_locked and v.price_coins<5;
update public.rewards_shop_items i set price_coins=p.price,updated_at=now()
from (select shop_item_id,min(price_coins) price from public.rewards_shop_item_variants where available group by shop_item_id) p
where i.id=p.shop_item_id and i.market_catalog_key is not null and not i.market_price_locked and i.price_coins is distinct from p.price;
notify pgrst,'reload schema';
