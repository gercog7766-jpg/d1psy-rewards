-- Apply on local VPS database BEFORE merging the application PR.
create table public.rewards_major_case_opens(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.rewards_users(id),
 request_id uuid not null,
 opened_at timestamptz not null default clock_timestamp(),
 prize_name text not null,
 prize_wear text not null,
 win_id uuid not null references public.rewards_wins(id),
 unique(user_id,request_id)
);
alter table public.rewards_major_case_opens enable row level security;
revoke all on public.rewards_major_case_opens from public,anon,authenticated;
grant select,insert on public.rewards_major_case_opens to service_role;

create function public.rewards_major_bronze_open(p_actor text,p_request uuid)
returns jsonb language plpgsql set search_path='' as $$
declare
 player public.rewards_users%rowtype;
 entry public.rewards_major_pickem_entries%rowtype;
 previous public.rewards_major_case_opens%rowtype;
 names text[]:=array[
 'AK-47 | Оливковый поликамуфляж','Five-SeveN | Небесная голубизна',
 'P250 | Ледяная корка','SG 553 | Корзинные полутона',
 'SCAR-20 | Песчаная сетка','M249 | Ледяная корка',
 'Негев | Кислый виноград','XM1014 | Ирэдзуми',
 'ПП-19 «Бизон» | Карамельное яблоко','MAC-10 | Световой короб',
 'Five-SeveN | Капилляры','CZ75-Auto | Эко'];
 wears text[]:=array['FT','FT','FT','FT','FT','FT','BS','BS','FT','FT','FT','FT'];
 weights integer[]:=array[7,10,10,10,10,10,10,10,8,8,5,2];
 slot integer;
 running integer:=0;
 idx integer;
 selected_idx integer;
 skin record;
 prize uuid;
 win uuid;
begin
 if p_request is null then raise exception 'invalid_request'; end if;
 select * into player from public.rewards_users where twitch_user_id=p_actor for update;
 if not found or coalesce(player.banned,false) or coalesce(player.participation_restricted,false) then raise exception 'user_unavailable'; end if;
 select * into previous from public.rewards_major_case_opens where user_id=player.id and request_id=p_request;
 if found then
  return jsonb_build_object('ok',true,'replayed',true,'winId',previous.win_id,'name',previous.prize_name,'wear',previous.prize_wear,
    'image',(select p.image_url from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id where w.id=previous.win_id),
    'tokens',(select tokens from public.rewards_major_pickem_entries where user_id=player.id));
 end if;
 select * into entry from public.rewards_major_pickem_entries where user_id=player.id for update;
 if not found then raise exception 'entry_required'; end if;
 if entry.tokens<1 then raise exception 'insufficient_tokens'; end if;
 -- Fail closed if ANY configured prize is missing; never charge for an unfulfillable draw.
 for idx in 1..12 loop
  if not exists (
    select 1 from public.rewards_shop_item_variants v
    join public.rewards_shop_items i on i.id=v.shop_item_id
    where i.name=names[idx] and v.available and i.status='available'
      and (i.stock is null or i.stock>0)
      and (v.wear=wears[idx] or (wears[idx]='FT' and v.wear in ('Field-Tested','После полевых испытаний'))
        or (wears[idx]='BS' and v.wear in ('Battle-Scarred','Закалённое в боях')))
  ) then raise exception 'case_catalog_incomplete'; end if;
 end loop;
 slot:=public.rewards_crypto_index(100);
 for idx in 1..12 loop
  running:=running+weights[idx];
  if slot<running then selected_idx:=idx; exit; end if;
 end loop;
 -- Resolve an exact available catalog variant, not a similarly named wear.
 select i.name,i.image_url,v.wear,v.variant_kind,v.price_coins
 into skin from public.rewards_shop_item_variants v
 join public.rewards_shop_items i on i.id=v.shop_item_id
 where i.name=names[selected_idx] and v.available and i.status='available'
   and (i.stock is null or i.stock>0)
   and (v.wear=wears[selected_idx] or (wears[selected_idx]='FT' and v.wear in ('Field-Tested','После полевых испытаний'))
     or (wears[selected_idx]='BS' and v.wear in ('Battle-Scarred','Закалённое в боях')))
 order by v.price_coins asc limit 1;
 if not found then raise exception 'case_prize_unavailable'; end if;
 update public.rewards_major_pickem_entries set tokens=tokens-1 where user_id=player.id;
 insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
 values(skin.name,skin.image_url,'disabled',true,1,skin.price_coins) returning id into prize;
 insert into public.rewards_wins(user_id,prize_id,won_at,delivery_status,choice_status,source_type,item_wear,item_variant_kind)
 values(player.id,prize,clock_timestamp(),'awaiting_choice','awaiting_choice','promo_upgrade',skin.wear,skin.variant_kind) returning id into win;
 insert into public.rewards_major_case_opens(user_id,request_id,prize_name,prize_wear,win_id)
 values(player.id,p_request,skin.name,skin.wear,win);
 return jsonb_build_object('ok',true,'winId',win,'name',skin.name,'wear',skin.wear,'image',skin.image_url,
  'tokens',entry.tokens-1);
end;
$$;
revoke all on function public.rewards_major_bronze_open(text,uuid) from public,anon,authenticated;
grant execute on function public.rewards_major_bronze_open(text,uuid) to service_role;
-- Pick'em shop: fixed server-side prices, no client-provided cost.
create table public.rewards_major_shop_purchases(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.rewards_users(id),
 request_id uuid not null,
 item_index integer not null check(item_index between 0 and 8),
 win_id uuid not null references public.rewards_wins(id),
 purchased_at timestamptz not null default clock_timestamp(),
 unique(user_id,request_id)
);
alter table public.rewards_major_shop_purchases enable row level security;
revoke all on public.rewards_major_shop_purchases from public,anon,authenticated;
grant select,insert on public.rewards_major_shop_purchases to service_role;

create function public.rewards_major_shop_buy(p_actor text,p_request uuid,p_item integer)
returns jsonb language plpgsql set search_path='' as $$
declare
 player public.rewards_users%rowtype;
 entry public.rewards_major_pickem_entries%rowtype;
 prior public.rewards_major_shop_purchases%rowtype;
 names text[]:=array['SG 553 | Киберсила','FAMAS | Демонтаж','Револьвер R8 | Кровавая паутина','P250 | Валентность','Наклейка | Джек','AWP | Гадюка','CZ75-Auto | Поул-позиция','USP-S | Кровавый тигр','M4A4 | Злобный дайме'];
 costs integer[]:=array[1,2,3,4,5,10,15,25,40];
 skin record;
 prize uuid;
 win uuid;
begin
 if p_request is null or p_item is null or p_item not between 0 and 8 then raise exception 'invalid_request'; end if;
 select * into player from public.rewards_users where twitch_user_id=p_actor for update;
 if not found or coalesce(player.banned,false) or coalesce(player.participation_restricted,false) then raise exception 'user_unavailable'; end if;
 select * into prior from public.rewards_major_shop_purchases where user_id=player.id and request_id=p_request;
 if found then
  if prior.item_index<>p_item then raise exception 'invalid_request'; end if;
  return jsonb_build_object('ok',true,'replayed',true,'winId',prior.win_id,
   'name',names[p_item+1],'tokens',(select tokens from public.rewards_major_pickem_entries where user_id=player.id));
 end if;
 select * into entry from public.rewards_major_pickem_entries where user_id=player.id for update;
 if not found then raise exception 'entry_required'; end if;
 if entry.tokens<costs[p_item+1] then raise exception 'insufficient_tokens'; end if;
 select p.name,p.image_url,p.sell_price_coins as price into skin from public.rewards_prizes p
 where p.name=names[p_item+1] and p.status='available' and p.unlimited
 order by p.id limit 1;
 if not found then
  select i.name,i.image_url,v.price_coins as price into skin
  from public.rewards_shop_items i join public.rewards_shop_item_variants v on v.shop_item_id=i.id
  where i.name=names[p_item+1] and i.status='available' and v.available and (i.stock is null or i.stock>0)
  order by v.price_coins asc limit 1;
 end if;
 if not found then raise exception 'shop_item_unavailable'; end if;
 update public.rewards_major_pickem_entries set tokens=tokens-costs[p_item+1] where user_id=player.id;
 insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
 values(skin.name,skin.image_url,'disabled',true,1,coalesce(skin.price,0)) returning id into prize;
 insert into public.rewards_wins(user_id,prize_id,won_at,delivery_status,choice_status,source_type)
 values(player.id,prize,clock_timestamp(),'awaiting_choice','awaiting_choice','promo_upgrade') returning id into win;
 insert into public.rewards_major_shop_purchases(user_id,request_id,item_index,win_id)
 values(player.id,p_request,p_item,win);
 return jsonb_build_object('ok',true,'winId',win,'name',skin.name,'tokens',entry.tokens-costs[p_item+1]);
end;
$$;
revoke all on function public.rewards_major_shop_buy(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.rewards_major_shop_buy(text,uuid,integer) to service_role;

notify pgrst,'reload schema';
