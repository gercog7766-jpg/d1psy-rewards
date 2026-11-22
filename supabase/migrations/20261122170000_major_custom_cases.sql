create table public.rewards_major_cases(
 id text primary key check(id ~ '^[a-z0-9-]{1,48}$'), name text not null check(length(name) between 1 and 80),
 image text, cost int not null default 1 check(cost between 1 and 1000), active boolean not null default true,
 items jsonb not null, updated_at timestamptz not null default now()
);
alter table public.rewards_major_cases enable row level security;
revoke all on public.rewards_major_cases from public,anon,authenticated;
grant select,insert,update on public.rewards_major_cases to service_role;
alter table public.rewards_major_case_opens add column case_id text not null default 'bronze';

create function public.rewards_major_case_offers(p_id text,p_items jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare x jsonb; skin record; offer jsonb; result jsonb:='[]'; legacy jsonb;
begin
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'invalid_items';end if;
 if exists(select 1 from jsonb_array_elements(p_items) q(value) where jsonb_typeof(q.value->'weight') is distinct from 'number' or (q.value->>'weight')::numeric not between 1 and 10000 or (q.value->>'weight')::numeric<>trunc((q.value->>'weight')::numeric)) or (select sum((q.value->>'weight')::numeric) from jsonb_array_elements(p_items) q(value))<>10000 then raise exception 'invalid_weights';end if;
 if (select count(distinct (q.value-'weight')) from jsonb_array_elements(p_items) q(value))<>jsonb_array_length(p_items) then raise exception 'duplicate_items';end if;
 for x in select value from jsonb_array_elements(p_items) loop
  if x ? 'legacy' then
   if p_id<>'bronze' or (x->>'legacy')::int not between 0 and 11 then raise exception 'invalid_items';end if;
   if legacy is null then legacy:=public.rewards_major_bronze_offers();end if;
   offer:=legacy->((x->>'legacy')::int);
  else
   if x->>'variantId' is not null then
    select i.name,i.image_url,v.wear,v.variant_kind,v.price_coins into skin from public.rewards_shop_items i join public.rewards_shop_item_variants v on v.shop_item_id=i.id
    where i.id=(x->>'itemId')::uuid and v.id=(x->>'variantId')::uuid and i.status='available' and (i.stock is null or i.stock>0) and v.available and v.price_coins>0;
   else
    select i.name,i.image_url,null::text wear,'normal'::text variant_kind,i.price_coins into skin from public.rewards_shop_items i
    where i.id=(x->>'itemId')::uuid and i.status='available' and (i.stock is null or i.stock>0) and i.price_coins>0 and not exists(select 1 from public.rewards_shop_item_variants v where v.shop_item_id=i.id);
   end if;
   if not found then raise exception 'case_catalog_incomplete';end if;
   offer:=to_jsonb(skin);
  end if;
  if offer is null or nullif(offer->>'image_url','') is null or (offer->>'price_coins')::int is null then raise exception 'case_catalog_incomplete';end if;
  result:=result||jsonb_build_array(offer||jsonb_build_object('weight',(x->>'weight')::int));
 end loop;
 return result;
end$$;

create function public.rewards_major_case_save(p_actor text,p_id text,p_name text,p_image text,p_cost int,p_active boolean,p_items jsonb) returns void
language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.rewards_admins where twitch_user_id=p_actor) then raise exception 'admin_required';end if;
 perform public.rewards_major_case_offers(p_id,p_items);
 insert into public.rewards_major_cases(id,name,image,cost,active,items) values(p_id,p_name,p_image,p_cost,p_active,p_items)
 on conflict(id) do update set name=excluded.name,image=excluded.image,cost=excluded.cost,active=excluded.active,items=excluded.items,updated_at=now();
end$$;

alter function public.rewards_major_bronze_open(text,uuid) rename to rewards_major_bronze_open_legacy;
create function public.rewards_major_case_open(p_actor text,p_request uuid,p_id text) returns jsonb
language plpgsql set search_path='' as $$
declare player public.rewards_users; entry public.rewards_major_pickem_entries; previous public.rewards_major_case_opens; cfg public.rewards_major_cases; offers jsonb; o jsonb; chosen jsonb; slot int; running int:=0; prize uuid; win uuid;
begin
 if p_request is null then raise exception 'invalid_request';end if;
 select * into player from public.rewards_users where twitch_user_id=p_actor for update;
 if not found or coalesce(player.banned,false) or coalesce(player.participation_restricted,false) then raise exception 'user_unavailable';end if;
 select * into previous from public.rewards_major_case_opens where user_id=player.id and request_id=p_request;
 if found then
  if previous.case_id<>p_id then raise exception 'invalid_request';end if;
  return jsonb_build_object('ok',true,'replayed',true,'winId',previous.win_id,'name',previous.prize_name,'wear',previous.prize_wear,'image',(select p.image_url from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id where w.id=previous.win_id),'tokens',(select tokens from public.rewards_major_pickem_entries where user_id=player.id));
 end if;
 select * into cfg from public.rewards_major_cases where id=p_id;
 if not found then if p_id='bronze' then return public.rewards_major_bronze_open_legacy(p_actor,p_request);end if;raise exception 'case_unavailable';end if;
 if not cfg.active then raise exception 'case_unavailable';end if;
 select * into entry from public.rewards_major_pickem_entries where user_id=player.id for update;
 if not found then raise exception 'entry_required';end if;
 if entry.tokens<cfg.cost then raise exception 'insufficient_tokens';end if;
 offers:=public.rewards_major_case_offers(p_id,cfg.items);
 slot:=public.rewards_crypto_index(10000);
 for o in select value from jsonb_array_elements(offers) loop running:=running+(o->>'weight')::int;if slot<running then chosen:=o;exit;end if;end loop;
 if chosen is null then raise exception 'case_catalog_incomplete';end if;
 update public.rewards_major_pickem_entries set tokens=tokens-cfg.cost where user_id=player.id;
 insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins) values(chosen->>'name',chosen->>'image_url','disabled',true,1,(chosen->>'price_coins')::int) returning id into prize;
 insert into public.rewards_wins(user_id,prize_id,won_at,delivery_status,choice_status,source_type,item_wear,item_variant_kind) values(player.id,prize,clock_timestamp(),'awaiting_choice','awaiting_choice',null,chosen->>'wear',chosen->>'variant_kind') returning id into win;
 insert into public.rewards_major_case_opens(user_id,request_id,prize_name,prize_wear,win_id,case_id) values(player.id,p_request,chosen->>'name',coalesce(chosen->>'wear',''),win,p_id);
 return jsonb_build_object('ok',true,'winId',win,'name',chosen->>'name','wear',chosen->>'wear','kind',chosen->>'variant_kind','image',chosen->>'image_url','catalog',public.rewards_major_bronze_artwork(offers),'tokens',entry.tokens-cfg.cost);
end$$;
create function public.rewards_major_bronze_open(p_actor text,p_request uuid) returns jsonb language sql set search_path='' as $$ select public.rewards_major_case_open(p_actor,p_request,'bronze') $$;
revoke all on function public.rewards_major_case_offers(text,jsonb),public.rewards_major_case_save(text,text,text,text,int,boolean,jsonb),public.rewards_major_case_open(text,uuid,text),public.rewards_major_bronze_open(text,uuid) from public,anon,authenticated;
grant execute on function public.rewards_major_case_offers(text,jsonb),public.rewards_major_case_save(text,text,text,text,int,boolean,jsonb),public.rewards_major_case_open(text,uuid,text),public.rewards_major_bronze_open(text,uuid) to service_role;
notify pgrst,'reload schema';
