-- Exact tier mapping over 100 equally likely integer outcomes.
create function public.rewards_contract_bounds(p_roll integer)
returns integer[] language plpgsql immutable strict security invoker set search_path='' as $$
begin
 if p_roll<0 or p_roll>99 then raise exception 'invalid_roll'; end if;
 return case when p_roll<15 then array[40,60]
  when p_roll<40 then array[61,80]
  when p_roll<70 then array[81,105]
  when p_roll<90 then array[106,150]
  else array[151,200] end;
end;
$$;
revoke all on function public.rewards_contract_bounds(integer) from public,anon,authenticated;
grant execute on function public.rewards_contract_bounds(integer) to service_role;

create or replace function public.rewards_run_contract(p_user_id uuid,p_source_win_ids uuid[],p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 ids uuid[]; old public.rewards_contracts; s record; v record;
 n integer:=0; total bigint:=0; roll integer; pct integer; bounds integer[]; lo integer; hi integer;
 prize uuid; reward uuid; contract uuid:=gen_random_uuid(); out jsonb; target_name text;
begin
 if p_user_id is null or p_request_id is null or coalesce(cardinality(p_source_win_ids),0) not between 3 and 10 or array_position(p_source_win_ids,null) is not null then raise exception 'invalid_request'; end if;
 select array_agg(x order by x) into ids from (select distinct unnest(p_source_win_ids) x) a;
 if cardinality(ids)<>cardinality(p_source_win_ids) then raise exception 'invalid_request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into old from public.rewards_contracts where user_id=p_user_id and request_id=p_request_id;
 if found then
  if old.source_win_ids<>ids then raise exception 'request_conflict'; end if;
  return old.result;
 end if;
 -- Ordered row locks also serialize with existing sell, claim and upgrade RPCs.
 for s in select w.id,w.choice_status,w.delivery_status,p.sell_price_coins
  from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id
  where w.user_id=p_user_id and w.id=any(ids) order by w.id for update of w
 loop
  if s.choice_status<>'awaiting_choice' or s.delivery_status not in ('pending','awaiting_choice') or coalesce(s.sell_price_coins,0)<=0 then raise exception 'source_not_available'; end if;
  total:=total+s.sell_price_coins; n:=n+1;
 end loop;
 if n<>cardinality(ids) then raise exception 'source_not_available'; end if;
 -- All five ranges must be representable before drawing the tier. Never reroll
 -- an empty tier: that would redistribute probability toward populated ranges.
 if exists(
  select 1 from (values (40,60),(61,80),(81,105),(106,150),(151,200)) as ranges(lo,hi)
  where not exists(
   select 1 from public.rewards_shop_item_variants sv
   join public.rewards_shop_items si on si.id=sv.shop_item_id
   where sv.available and si.status='available' and (si.stock is null or si.stock>0)
   and sv.price_coins>0 and sv.price_coins::numeric*100 between total::numeric*ranges.lo and total::numeric*ranges.hi
  )
 ) then raise exception 'no_contract_result'; end if;
 roll:=floor(random()*100)::integer;
 bounds:=public.rewards_contract_bounds(roll); lo:=bounds[1]; hi:=bounds[2];
 pct:=lo+floor(random()*(hi-lo+1))::integer;
 -- Choose the nearest actual catalog item strictly inside the drawn tier.
 select sv.id,sv.price_coins,sv.wear,sv.variant_kind,si.name,si.image_url into v
 from public.rewards_shop_item_variants sv join public.rewards_shop_items si on si.id=sv.shop_item_id
 where sv.available and si.status='available' and (si.stock is null or si.stock>0)
 and sv.price_coins>0 and sv.price_coins::numeric*100 between total::numeric*lo and total::numeric*hi
 order by abs(sv.price_coins::numeric-total*pct/100.0),sv.id limit 1 for share of sv,si;
 if not found then raise exception 'no_contract_result'; end if;
 target_name:=case v.variant_kind when 'stattrak' then 'StatTrak™ ' when 'souvenir' then 'Сувенирный ' else '' end||v.name;
 -- Separate disabled prize: never reuse or change the giveaway pool.
 insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
 values(target_name,v.image_url,'disabled',true,1,v.price_coins) returning id into prize;
 update public.rewards_wins set choice_status='contracted',choice_at=now() where id=any(ids) and user_id=p_user_id;
 insert into public.rewards_wins(round_id,user_id,prize_id,delivery_status,choice_status,item_wear,item_variant_kind,source_type)
 values(null,p_user_id,prize,'awaiting_choice','awaiting_choice',v.wear,v.variant_kind,'contract') returning id into reward;
 out:=jsonb_build_object('ok',true,'contractId',contract,'sourceValue',total,'reward',jsonb_build_object('id',reward,'name',target_name,'imageUrl',v.image_url,'price',v.price_coins,'wear',v.wear,'kind',v.variant_kind));
 insert into public.rewards_contracts(id,user_id,request_id,source_win_ids,source_value_coins,rolled_percent,reward_win_id,result)
 values(contract,p_user_id,p_request_id,ids,total,pct,reward,out);
 return out;
end;
$$;
revoke all on function public.rewards_run_contract(uuid,uuid[],uuid) from public,anon,authenticated;
grant execute on function public.rewards_run_contract(uuid,uuid[],uuid) to service_role;
