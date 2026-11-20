-- Resolve all twelve exact offers once. Never debit a token if an image is missing.
create function public.rewards_major_bronze_offers() returns jsonb
language plpgsql stable set search_path='' as $$
declare
 names text[]:=array[
 'AK-47 | Оливковый поликамуфляж','Five-SeveN | Небесная голубизна',
 'P250 | Ледяная корка','SG 553 | Корзинные полутона',
 'SCAR-20 | Песчаная сетка','M249 | Ледяная корка',
 'Негев | Кислый виноград','XM1014 | Ирэдзуми',
 'ПП-19 «Бизон» | Карамельное яблоко','MAC-10 | Световой короб',
 'Five-SeveN | Капилляры','CZ75-Auto | Эко'];
 wears text[]:=array[null,'FT',null,'FT',null,null,'BS',null,'FT',null,'FT','FT'];
 idx int; skin record; offers jsonb:='[]';
begin
 for idx in 1..12 loop
  if wears[idx] is null or idx in (2,4,7,9) then
   select names[idx] as name,p.image_url,wears[idx] as wear,'normal'::text variant_kind,p.sell_price_coins as price_coins
   into skin from public.rewards_prizes p
   where (p.name=names[idx] or p.name=names[idx]||' '||wears[idx] or (wears[idx] is null and p.name in (names[idx]||' FT',names[idx]||' BS')))
     and p.status='available' and nullif(trim(p.image_url),'') is not null
   order by p.id limit 1;
  else
   select i.name,i.image_url,v.wear,v.variant_kind,coalesce(v.price_coins,i.price_coins) as price_coins
   into skin from public.rewards_shop_item_variants v join public.rewards_shop_items i on i.id=v.shop_item_id
   where i.name=names[idx] and v.available and i.status='available' and (i.stock is null or i.stock>0)
     and v.wear=wears[idx] and nullif(trim(i.image_url),'') is not null
   order by v.price_coins asc nulls last,i.id,v.variant_kind limit 1;
  end if;
  if not found then return null;end if;
  offers:=offers||jsonb_build_array(to_jsonb(skin));
 end loop;
 return offers;
end$$;
create function public.rewards_major_bronze_artwork(p_offers jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('name',o->>'name','image',o->>'image_url') order by n),'[]')
 from jsonb_array_elements(p_offers) with ordinality as q(o,n)
$$;
revoke all on function public.rewards_major_bronze_offers(),public.rewards_major_bronze_artwork(jsonb) from public,anon,authenticated;
grant execute on function public.rewards_major_bronze_offers(),public.rewards_major_bronze_artwork(jsonb) to service_role;

create function public.rewards_major_bronze_catalog() returns jsonb
language sql stable set search_path='' as $$
 select public.rewards_major_bronze_artwork(public.rewards_major_bronze_offers())
$$;
revoke all on function public.rewards_major_bronze_catalog() from public,anon,authenticated;
grant execute on function public.rewards_major_bronze_catalog() to service_role;

create or replace function public.rewards_major_bronze_open(p_actor text,p_request uuid)
returns jsonb language plpgsql set search_path='' as $$
declare
 player public.rewards_users%rowtype; entry public.rewards_major_pickem_entries%rowtype;
 previous public.rewards_major_case_opens%rowtype;
 weights integer[]:=array[7,10,10,10,10,10,10,10,8,8,5,2];
 slot integer; running integer:=0; idx integer; selected_idx integer;
 offers jsonb; skin record; prize uuid; win uuid;
begin
 if p_request is null then raise exception 'invalid_request';end if;
 select * into player from public.rewards_users where twitch_user_id=p_actor for update;
 if not found or coalesce(player.banned,false) or coalesce(player.participation_restricted,false) then raise exception 'user_unavailable';end if;
 select * into previous from public.rewards_major_case_opens where user_id=player.id and request_id=p_request;
 if found then
  return jsonb_build_object('ok',true,'replayed',true,'winId',previous.win_id,'name',previous.prize_name,'wear',previous.prize_wear,
    'image',(select p.image_url from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id where w.id=previous.win_id),
    'catalog',public.rewards_major_bronze_catalog(),'tokens',(select tokens from public.rewards_major_pickem_entries where user_id=player.id));
 end if;
 select * into entry from public.rewards_major_pickem_entries where user_id=player.id for update;
 if not found then raise exception 'entry_required';end if;
 if entry.tokens<1 then raise exception 'insufficient_tokens';end if;
 offers:=public.rewards_major_bronze_offers();
 if offers is null or jsonb_array_length(offers)<>12 then raise exception 'case_catalog_incomplete';end if;
 slot:=public.rewards_crypto_index(100);
 for idx in 1..12 loop running:=running+weights[idx];if slot<running then selected_idx:=idx;exit;end if;end loop;
 select * into skin from jsonb_to_record(offers->(selected_idx-1)) as q(name text,image_url text,wear text,variant_kind text,price_coins int);
 if not found then raise exception 'case_prize_unavailable';end if;
 update public.rewards_major_pickem_entries set tokens=tokens-1 where user_id=player.id;
 insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
 values(skin.name,skin.image_url,'disabled',true,1,skin.price_coins) returning id into prize;
 insert into public.rewards_wins(user_id,prize_id,won_at,delivery_status,choice_status,source_type,item_wear,item_variant_kind)
 values(player.id,prize,clock_timestamp(),'awaiting_choice','awaiting_choice',null,skin.wear,skin.variant_kind) returning id into win;
 insert into public.rewards_major_case_opens(user_id,request_id,prize_name,prize_wear,win_id)
 values(player.id,p_request,skin.name,coalesce(skin.wear,''),win);
 return jsonb_build_object('ok',true,'winId',win,'name',skin.name,'wear',skin.wear,'image',skin.image_url,
  'catalog',public.rewards_major_bronze_artwork(offers),'tokens',entry.tokens-1);
end$$;
notify pgrst,'reload schema';
