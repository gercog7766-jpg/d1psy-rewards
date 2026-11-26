-- The existing upgrade functions remain unchanged. The new transaction wrapper
-- adds an independent rare bonus and stores the exact response for retry.
create table public.rewards_upgrade_streak_receipts(
 user_id uuid not null references public.rewards_users(id) on delete cascade,
 request_id uuid not null, body jsonb not null, response jsonb not null,
 created_at timestamptz not null default now(), primary key(user_id,request_id)
);
alter table public.rewards_upgrade_streak_receipts enable row level security;
revoke all on public.rewards_upgrade_streak_receipts from public,anon,authenticated;
grant select,insert on public.rewards_upgrade_streak_receipts to service_role;

create function public.rewards_run_skin_upgrade_streak(p_user_id uuid,p_request_id uuid,p_source_ids uuid[],p_target_ids uuid[],p_variant_ids uuid[],p_extra integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare body jsonb;receipt record;initial record;current_win uuid;current_value integer;current_name text;current_image text;candidate record;prize uuid;next_win uuid;step_roll integer;steps jsonb:='[]';active boolean:=false;activated boolean:=false;sector_start integer;reason text;result jsonb;initial_value integer;
begin
 if p_user_id is null or p_request_id is null or p_extra is null or p_extra<0 or coalesce(cardinality(p_source_ids),0) not between 1 and 4 or coalesce(cardinality(p_target_ids),0) not between 1 and 4 or cardinality(p_target_ids) is distinct from cardinality(p_variant_ids) or array_position(p_source_ids,null) is not null or array_position(p_target_ids,null) is not null or array_position(p_variant_ids,null) is not null or cardinality(p_source_ids)<>(select count(distinct x) from unnest(p_source_ids) x) or cardinality(p_variant_ids)<>(select count(distinct x) from unnest(p_variant_ids) x) then raise exception 'invalid_request';end if;
 body:=jsonb_build_object('sources',p_source_ids,'targets',p_target_ids,'variants',p_variant_ids,'extra',p_extra);
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select r.body,r.response into receipt from public.rewards_upgrade_streak_receipts r where r.user_id=p_user_id and r.request_id=p_request_id;
 if found then if receipt.body<>body then raise exception 'request_conflict';end if;return receipt.response;end if;
 if cardinality(p_source_ids)=1 and cardinality(p_target_ids)=1 then
  select * into strict initial from public.rewards_run_skin_upgrade(p_user_id,p_source_ids[1],p_target_ids[1],p_variant_ids[1],p_extra);
 else select * into strict initial from public.rewards_run_skin_upgrade_multi(p_user_id,p_source_ids,p_target_ids,p_variant_ids,p_extra);end if;
 current_win:=initial.reward_win_id;
 -- The entire 300-basis-point bonus sector must lie inside the base win sector.
 -- Multi-target rewards are kept unchanged rather than arbitrarily replacing one.
 if cardinality(p_target_ids)=1 and initial.chance_bps>=300 then
  active:=public.rewards_crypto_index(10000)<50;
  sector_start:=(initial.chance_bps-300)/2;
  activated:=active and initial.result='won' and initial.roll_bps>=sector_start and initial.roll_bps<sector_start+300 and current_win is not null;
 end if;
 if activated then
  select p.name,p.image_url,p.sell_price_coins into strict current_name,current_image,current_value from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id where w.id=current_win and w.user_id=p_user_id and w.choice_status='awaiting_choice' for update of w;
  initial_value:=current_value;
  loop
   -- Fixed 50% bonus roll; choose a strictly higher, available catalog price as
   -- close to 1.8x as possible without exceeding its rounded upper bound.
   select v.id,v.price_coins,v.wear,v.variant_kind,i.name,i.image_url into candidate
   from public.rewards_shop_item_variants v join public.rewards_shop_items i on i.id=v.shop_item_id
   where v.available and i.status='available' and v.price_coins>=greatest(current_value::bigint+1,ceil(current_value::numeric*1.7)) and v.price_coins<=ceil(current_value::numeric*1.8)
   order by v.price_coins desc,v.id limit 1;
   if not found then reason:='catalog_end';exit;end if;
   step_roll:=public.rewards_crypto_index(10000);
   candidate.name:=case when candidate.variant_kind='stattrak' then 'StatTrak™ ' when candidate.variant_kind='souvenir' then 'Сувенирный ' else '' end||candidate.name;
   steps:=steps||jsonb_build_array(jsonb_build_object('chanceBps',5000,'rollBps',step_roll,'won',step_roll<5000,'name',candidate.name,'imageUrl',candidate.image_url,'value',candidate.price_coins,'wear',candidate.wear));
   if step_roll>=5000 then reason:='lost';exit;end if;
   select p.id into prize from public.rewards_prizes p where p.name=candidate.name and p.sell_price_coins=candidate.price_coins and coalesce(p.upgrade_value_coins,p.sell_price_coins)=candidate.price_coins and p.drop_shop_item_id is null order by p.created_at desc limit 1;
   if prize is null then insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins) values(candidate.name,candidate.image_url,'disabled',true,1,candidate.price_coins) returning id into prize;end if;
   -- A successful bonus step replaces exactly one preceding reward. A losing
   -- step never touches it. All mutations and the receipt commit together.
   update public.rewards_wins set choice_status='upgraded',choice_at=now() where id=current_win and user_id=p_user_id and choice_status='awaiting_choice';if not found then raise exception 'streak_reward_unavailable';end if;
   insert into public.rewards_wins(round_id,user_id,prize_id,delivery_status,choice_status,won_at,item_wear,item_variant_kind,source_type) values(null,p_user_id,prize,'pending','awaiting_choice',now(),candidate.wear,candidate.variant_kind,'upgrader') returning id into next_win;
   current_win:=next_win;current_value:=candidate.price_coins;current_name:=candidate.name;current_image:=candidate.image_url;
  end loop;
 end if;
 result:=jsonb_build_object('ok',true,'result',initial.result,'chanceBps',initial.chance_bps,'rollBps',initial.roll_bps,'upgradeId',initial.upgrade_id,'rewardWinId',current_win,'streak',case when active then jsonb_build_object('active',true,'activated',activated,'sectorStartBps',sector_start,'sectorSizeBps',300,'steps',steps,'endReason',reason,'initialValue',initial_value,'final',case when activated then jsonb_build_object('winId',current_win,'name',current_name,'imageUrl',current_image,'value',current_value) else null end) else null end);
 insert into public.rewards_upgrade_streak_receipts(user_id,request_id,body,response) values(p_user_id,p_request_id,body,result);
 return result;
end $$;
revoke all on function public.rewards_run_skin_upgrade_streak(uuid,uuid,uuid[],uuid[],uuid[],integer) from public,anon,authenticated;
grant execute on function public.rewards_run_skin_upgrade_streak(uuid,uuid,uuid[],uuid[],uuid[],integer) to service_role;
notify pgrst,'reload schema';
