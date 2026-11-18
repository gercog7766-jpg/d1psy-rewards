-- Move Major Pick'em rewards to the standard inventory. No duplicate wins or token charges.
-- The links to case opens and shop purchases identify only rewards from these features.
BEGIN;
UPDATE public.rewards_wins w SET source_type=NULL
WHERE w.source_type='promo_upgrade' AND (
 EXISTS (SELECT 1 FROM public.rewards_major_case_opens c WHERE c.win_id=w.id)
 OR EXISTS (SELECT 1 FROM public.rewards_major_shop_purchases s WHERE s.win_id=w.id)
);
create or replace function public.rewards_major_bronze_open(p_actor text,p_request uuid)
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
 wears text[]:=array[null,'FT',null,'FT',null,null,'BS',null,'FT',null,'FT','FT'];
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
  if wears[idx] is null or idx in (2,4,7,9) then
   if not exists (select 1 from public.rewards_prizes p
      where (p.name=names[idx] or p.name=names[idx]||' '||wears[idx] or (wears[idx] is null and p.name in (names[idx]||' FT',names[idx]||' BS'))) and p.image_url is not null and p.status='available')
   then raise exception 'case_catalog_incomplete'; end if;
  else
   if not exists (
    select 1 from public.rewards_shop_item_variants v
    join public.rewards_shop_items i on i.id=v.shop_item_id
    where i.name=names[idx] and v.available and i.status='available'
      and (i.stock is null or i.stock>0) and v.wear=wears[idx]
   ) then raise exception 'case_catalog_incomplete'; end if;
  end if;
 end loop;
 slot:=public.rewards_crypto_index(100);
 for idx in 1..12 loop
  running:=running+weights[idx];
  if slot<running then selected_idx:=idx; exit; end if;
 end loop;
 -- Resolve an exact available catalog variant, not a similarly named wear.
 if wears[selected_idx] is null or selected_idx in (2,4,7,9) then
  select names[selected_idx] as name,p.image_url,wears[selected_idx] as wear,'normal'::text as variant_kind,p.sell_price_coins as price_coins
  into skin from public.rewards_prizes p
  where (p.name=names[selected_idx] or p.name=names[selected_idx]||' '||wears[selected_idx] or (wears[selected_idx] is null and p.name in (names[selected_idx]||' FT',names[selected_idx]||' BS'))) and p.status='available' and p.image_url is not null
  order by p.id limit 1;
 else
  select i.name,i.image_url,v.wear,v.variant_kind,coalesce(v.price_coins,i.price_coins) as price_coins
  into skin from public.rewards_shop_item_variants v
  join public.rewards_shop_items i on i.id=v.shop_item_id
  where i.name=names[selected_idx] and v.available and i.status='available'
    and (i.stock is null or i.stock>0) and v.wear=wears[selected_idx]
  order by v.price_coins asc nulls last limit 1;
 end if;
 if not found then raise exception 'case_prize_unavailable'; end if;
 update public.rewards_major_pickem_entries set tokens=tokens-1 where user_id=player.id;
 insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
 values(skin.name,skin.image_url,'disabled',true,1,skin.price_coins) returning id into prize;
 insert into public.rewards_wins(user_id,prize_id,won_at,delivery_status,choice_status,source_type,item_wear,item_variant_kind)
 values(player.id,prize,clock_timestamp(),'awaiting_choice','awaiting_choice',null,skin.wear,skin.variant_kind) returning id into win;
 insert into public.rewards_major_case_opens(user_id,request_id,prize_name,prize_wear,win_id)
 values(player.id,p_request,skin.name,coalesce(skin.wear,''),win);
 return jsonb_build_object('ok',true,'winId',win,'name',skin.name,'wear',skin.wear,'image',skin.image_url,
  'tokens',entry.tokens-1);
end;
$$;

create or replace function public.rewards_major_shop_buy(p_actor text,p_request uuid,p_item integer)
returns jsonb language plpgsql set search_path='' as $$
declare
 player public.rewards_users%rowtype;
 entry public.rewards_major_pickem_entries%rowtype;
 prior public.rewards_major_shop_purchases%rowtype;
 names text[]:=array['SG 553 | Киберсила','FAMAS | Демонтаж','Револьвер R8 | Кровавая паутина','P250 | Валентность','Наклейка | Джек','AWP | Гадюка','CZ75-Auto | Поул-позиция','USP-S | Кровавый тигр','M4A4 | Злобный дайме'];
 costs integer[]:=array[1,2,3,4,5,10,15,25,40];
 skin record;
 images text[]:=array[
'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLimcO1qx1Y-s29b_E4c8-QF2WV0-h5ouJscCW6khUz_Wjdntr6Iy6WbgEjA5MlRedctxG5kNKyNbi3sgTfi9oUnyj9234b5n51o7FVairOMAY',
'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL3n5vh7h1I_82jbbdlH_icGliRz-pJs-5lSxa_nBovp3PQw9r9cXuQZwMjXMF0E7YN4ES9loflPu_htQTX3otGyS3_iCNP6ixq_a9cBmFkCHH9',
'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLjm4Dv8TRe_c2mcZt6JfKAMWuZxuZi_rdrHny2wkR_sDuHw4muJXuWOwZyAsdzTeNcu0S4ktfkP77htAOPiYlbjXKp8jg9HbM',
'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLhzMOwwiNK0OL8PfRSI_-dGmiF09F6ueZhW2fiwUx14zmDnNagcC-WagUkApslQuBYsUW_ktexPry3swPfiogTyyiqkGoXuQius2mt',
'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJai0ki7VeTHjNm0MnqF41d28bj360n0VBH00Zzh_ikV6fP6P6E4JqOSCDLBx7Yv6LE6GC-xkElz5mTXzt-gJX-TO1AgA8Z0QPlK7Ee7j9FI4g',
'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf9Ttk_PyvY6F-K_mdMWuZxuZi_rQ_GS3mxRwk4jvTyNv6eC-RPQV1W5AlTOZb4xLtw9fuNriw51Hd3otbjXKp4cSTTIs',
'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLyhMG1_B1Y-s2tcvM4H-CBC2SZ0ud5vt5lRi67gVNy4mTdzdmgc33COg90DcB2FuMPtxLpldSxZeLn4w2K34NCzXj9hnsY8G81tCL36RK-',
'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLkjYbf7itX6vytbbZSKOmsHGKU1edxtfNWQyC0nQlptWWEzd-qd3mVbgR2WZYiFuUMtUG7x4HhYeLhs1fZiN1DnC6viH4Y7TErvbgp6HjWjQ',
'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwiFO0P_6afBSJeaaAliUwOd7qe5WQyC0nQlp4GqGz42ucCqXaQMhDpd4R-AIsxK6ktXgZePltVPXitoRn3-tjCgd6zErvbijVJZd2Q'
];
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
 -- The Major shop has its own fixed, curated rewards; no dependency on public shop availability.
 select names[p_item+1] as name, images[p_item+1] as image_url, 0 as price into skin;
 update public.rewards_major_pickem_entries set tokens=tokens-costs[p_item+1] where user_id=player.id;
 insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
 values(skin.name,skin.image_url,'disabled',true,1,coalesce(skin.price,0)) returning id into prize;
 insert into public.rewards_wins(user_id,prize_id,won_at,delivery_status,choice_status,source_type)
 values(player.id,prize,clock_timestamp(),'awaiting_choice','awaiting_choice',null) returning id into win;
 insert into public.rewards_major_shop_purchases(user_id,request_id,item_index,win_id)
 values(player.id,p_request,p_item,win);
 return jsonb_build_object('ok',true,'winId',win,'name',skin.name,'tokens',entry.tokens-costs[p_item+1]);
end;
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
