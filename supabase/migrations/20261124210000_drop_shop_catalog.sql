-- A shop drop is a historical prize snapshot, not a copy of the entire shop.
alter table public.rewards_prizes add column drop_shop_item_id uuid,
 add column drop_shop_variant_id uuid, add column drop_wear text, add column drop_kind text;
alter table public.rewards_streamer_live_rounds add column requested_shop_item uuid,
 add column requested_shop_variant uuid;

-- Narrow price ranges can be read without scanning the rest of the catalog.
create index if not exists rewards_drop_shop_variant_price_idx on public.rewards_shop_item_variants(price_coins,shop_item_id,id) where available;
create index if not exists rewards_drop_shop_fixed_price_idx on public.rewards_shop_items(price_coins,id) where status='available' and stock is null;
create unique index rewards_drop_shop_snapshot_idx on public.rewards_prizes(drop_shop_item_id,drop_shop_variant_id,sell_price_coins) nulls not distinct where drop_shop_item_id is not null;

create view public.rewards_drop_shop_pool with (security_invoker=true) as
 select i.id as item_id,v.id as variant_id,i.name,i.image_url,v.price_coins as price,v.wear,v.variant_kind as kind
 from public.rewards_shop_items i join public.rewards_shop_item_variants v on v.shop_item_id=i.id
 where i.status='available' and i.stock is null and v.available and v.price_coins>0
 union all
 select i.id,null::uuid,i.name,i.image_url,i.price_coins,null::text,null::text
 from public.rewards_shop_items i where i.status='available' and i.stock is null and i.price_coins>0
 and not exists(select 1 from public.rewards_shop_item_variants v where v.shop_item_id=i.id);
revoke all on public.rewards_drop_shop_pool from public,anon,authenticated;
grant select on public.rewards_drop_shop_pool to service_role;

create function public.rewards_drop_shop_search(p_query text,p_min integer,p_max integer,p_wear text,p_kind text,p_page integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_query is null or length(p_query)>100 or p_min<2 or p_max>3000 or p_page not between 0 and 1000
 or p_wear not in('','FN','MW','FT','WW','BS') or p_kind not in('','normal','stattrak','souvenir') then raise exception 'invalid_search';end if;
 if p_max<p_min then return jsonb_build_object('items','[]'::jsonb,'hasMore',false);end if;
 with rows as materialized(select * from public.rewards_drop_shop_pool where price between p_min and p_max
  and (p_query='' or strpos(lower(name),lower(p_query))>0)
  and (p_wear='' or wear=p_wear) and (p_kind='' or kind=p_kind)
  order by price,item_id,variant_id offset p_page*50 limit 51)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r)) from(select * from rows order by price,item_id,variant_id limit 50) r),'[]'::jsonb),'hasMore',(select count(*)>50 from rows)) into result;
 return result;
end$$;

create function public.rewards_drop_shop_pick(p_min integer,p_max integer,p_item uuid default null,p_variant uuid default null,p_allow_finite boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare chosen record; saved public.rewards_prizes; label text;
begin
 if p_min is null or p_max is null or p_min<2 or p_max>3000 or (p_variant is not null and p_item is null) then raise exception 'invalid_prize_price_range';end if;
 if p_max<p_min then return null;end if;
 with pool as materialized(select s.*,null::uuid as legacy_id from public.rewards_drop_shop_pool s where price between p_min and p_max
  and (p_item is null or (item_id=p_item and variant_id is not distinct from p_variant))
  union all select null::uuid,null::uuid,p.name,p.image_url,p.sell_price_coins,null::text,null::text,p.id
  from public.rewards_prizes p where p_item is null and p.status='available' and (p.unlimited or p_allow_finite) and p.sell_price_coins between p_min and p_max)
 select * into chosen from pool order by item_id,variant_id,legacy_id
 offset (select public.rewards_crypto_index(greatest(count(*)::integer,1)) from pool) limit 1;
 if not found then return null;end if;
 if chosen.legacy_id is not null then return jsonb_build_object('id',chosen.legacy_id,'name',chosen.name,'sell_price_coins',chosen.price);end if;
 -- Preserve wear/type separately for delivery. Disabled snapshots never enter the legacy pool.
 label:=case chosen.kind when 'stattrak' then 'StatTrak™ ' when 'souvenir' then 'Сувенирный ' else '' end||chosen.name||case when chosen.wear is not null then ' · '||chosen.wear else '' end;
 insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins,drop_shop_item_id,drop_shop_variant_id,drop_wear,drop_kind)
 values(label,chosen.image_url,'disabled',true,1,chosen.price,chosen.item_id,chosen.variant_id,chosen.wear,chosen.kind)
 on conflict(drop_shop_item_id,drop_shop_variant_id,sell_price_coins) where drop_shop_item_id is not null do nothing returning * into saved;
 if not found then select * into saved from public.rewards_prizes where drop_shop_item_id=chosen.item_id and drop_shop_variant_id is not distinct from chosen.variant_id and sell_price_coins=chosen.price;end if;
 return jsonb_build_object('id',saved.id,'name',saved.name,'sell_price_coins',saved.sell_price_coins);
end$$;

-- Do not null out metadata on unrelated shop purchases or other inventory rewards.
create function public.rewards_drop_win_variant() returns trigger language plpgsql security invoker set search_path='' as $$
declare p public.rewards_prizes;
begin
 select * into p from public.rewards_prizes where id=new.prize_id and drop_shop_item_id is not null;
 if found then new.item_wear:=p.drop_wear;new.item_variant_kind:=p.drop_kind;end if;
 return new;
end$$;
create trigger rewards_drop_win_variant before insert on public.rewards_wins for each row execute function public.rewards_drop_win_variant();

-- Keep the existing winner selection, eligibility, and payment logic unchanged.
do $$
declare definition text; old_guard text:=$old$if not found or v_prize.status<>'available' then raise exception 'prize_not_available';end if;$old$;
begin
 select pg_get_functiondef('public.rewards_finalize_round(uuid)'::regprocedure) into definition;
 if position(old_guard in definition)=0 then raise exception 'unexpected_drop_finalize_definition';end if;
 execute replace(definition,old_guard,$new$if not found or (v_prize.status<>'available' and (v_prize.status<>'disabled' or v_prize.drop_shop_item_id is null)) then raise exception 'prize_not_available';end if;$new$);
end$$;

-- Change only the selection expression inside the partner's existing locked budget transaction.
do $$
declare definition text;
 old_pick text:=$old$select * into pr from public.rewards_prizes where status='available' and unlimited and sell_price_coins between (p_body->>'minPrice')::integer and (p_body->>'maxPrice')::integer and sell_price_coins<=bal order by id offset public.rewards_crypto_index(greatest(1,(select count(*)::integer from public.rewards_prizes where status='available' and unlimited and sell_price_coins between (p_body->>'minPrice')::integer and (p_body->>'maxPrice')::integer and sell_price_coins<=bal))) limit 1;$old$;
 new_pick text:=$new$pr.id:=(public.rewards_drop_shop_pick((p_body->>'minPrice')::integer,least((p_body->>'maxPrice')::integer,bal)::integer,nullif(p_body->>'catalogItemId','')::uuid,nullif(p_body->>'catalogVariantId','')::uuid)->>'id')::uuid;
 select * into pr from public.rewards_prizes where id=pr.id;
 if not found and p_body->>'catalogItemId' is null then
  select * into pr from public.rewards_prizes where status='available' and unlimited and sell_price_coins between (p_body->>'minPrice')::integer and (p_body->>'maxPrice')::integer and sell_price_coins<=bal order by id offset public.rewards_crypto_index(greatest(1,(select count(*)::integer from public.rewards_prizes where status='available' and unlimited and sell_price_coins between (p_body->>'minPrice')::integer and (p_body->>'maxPrice')::integer and sell_price_coins<=bal))) limit 1;
 end if;$new$;
 old_retry text:=$old$r.max_price<>(p_body->>'maxPrice')::integer then raise exception 'request_conflict';$old$;
 old_insert text:=$old$insert into public.rewards_streamer_live_rounds(id,broadcaster_id,mode,seconds,threshold,min_price,max_price,prize_id,prize_name,cost) values(rid,target,p_body->>'mode',(p_body->>'seconds')::integer,(p_body->>'threshold')::integer,(p_body->>'minPrice')::integer,(p_body->>'maxPrice')::integer,pr.id,pr.name,pr.sell_price_coins);$old$;
begin
 select pg_get_functiondef('public.rewards_streamer_live_api(text,text,jsonb)'::regprocedure) into definition;
 if position(old_pick in definition)=0 or position(old_retry in definition)=0 or position(old_insert in definition)=0 then raise exception 'unexpected_partner_drop_definition';end if;
 definition:=replace(definition,old_pick,new_pick);
 definition:=replace(definition,old_retry,$new$r.max_price<>(p_body->>'maxPrice')::integer or r.requested_shop_item is distinct from nullif(p_body->>'catalogItemId','')::uuid or r.requested_shop_variant is distinct from nullif(p_body->>'catalogVariantId','')::uuid then raise exception 'request_conflict';$new$);
 definition:=replace(definition,old_insert,$new$insert into public.rewards_streamer_live_rounds(id,broadcaster_id,mode,seconds,threshold,min_price,max_price,prize_id,prize_name,cost,requested_shop_item,requested_shop_variant) values(rid,target,p_body->>'mode',(p_body->>'seconds')::integer,(p_body->>'threshold')::integer,(p_body->>'minPrice')::integer,(p_body->>'maxPrice')::integer,pr.id,pr.name,pr.sell_price_coins,nullif(p_body->>'catalogItemId','')::uuid,nullif(p_body->>'catalogVariantId','')::uuid);$new$);
 execute definition;
end$$;
revoke all on function public.rewards_drop_shop_search(text,integer,integer,text,text,integer),public.rewards_drop_shop_pick(integer,integer,uuid,uuid,boolean),public.rewards_drop_win_variant() from public,anon,authenticated;
grant execute on function public.rewards_drop_shop_search(text,integer,integer,text,text,integer),public.rewards_drop_shop_pick(integer,integer,uuid,uuid,boolean),public.rewards_drop_win_variant() to service_role;
notify pgrst,'reload schema';
