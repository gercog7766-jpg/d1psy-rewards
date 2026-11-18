-- Major Pick'em rewards are a separate fixed catalog; safe to apply while site runs.
-- Existing purchases and token balances are unchanged.
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
 values(player.id,prize,clock_timestamp(),'awaiting_choice','awaiting_choice','promo_upgrade') returning id into win;
 insert into public.rewards_major_shop_purchases(user_id,request_id,item_index,win_id)
 values(player.id,p_request,p_item,win);
 return jsonb_build_object('ok',true,'winId',win,'name',skin.name,'tokens',entry.tokens-costs[p_item+1]);
end;
$$;
revoke all on function public.rewards_major_shop_buy(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.rewards_major_shop_buy(text,uuid,integer) to service_role;
notify pgrst,'reload schema';
