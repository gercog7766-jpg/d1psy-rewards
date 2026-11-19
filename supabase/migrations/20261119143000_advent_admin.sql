-- Retain exact wallet and inventory receipt identities for future claims.
create or replace function public.rewards_advent_2026(p_actor text,p_action text,p_day integer default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 player public.rewards_users%rowtype; skin public.rewards_advent_skins%rowtype;
 stamp timestamptz; day_available integer; owned boolean; ready boolean; balance bigint; tx uuid; prize uuid; win uuid; reward jsonb;
 amounts integer[]:=array[5,0,8,0,5,0,0,10,5,0,8,0,5,0,0,10,5,0,8,0,5,0,10,5,0,8,5,10,5,15,0];
 item text; item_name text;
begin
 if p_action is null or p_action not in('state','buy','claim') then raise exception 'invalid_request'; end if;
 select * into player from public.rewards_users where twitch_user_id=p_actor for update;
 if not found or coalesce(player.banned,false) or coalesce(player.participation_restricted,false) then raise exception 'user_unavailable'; end if;
 stamp:=clock_timestamp();
 day_available:=greatest(0,least(31,1+floor(extract(epoch from (stamp-'2026-12-01 00:00:00+03'::timestamptz))/86400)::integer));
 select exists(select 1 from public.rewards_advent_purchases where user_id=player.id) into owned;
 select enabled and (select count(*)=4 from public.rewards_advent_skins) into ready from public.rewards_advent_settings where id=1;
 select coalesce(sum(amount),0) into balance from public.rewards_coin_transactions where user_id=player.id;
 if p_action='buy' and not owned then
  if not ready then raise exception 'advent_unavailable'; end if;
  if stamp>='2026-12-11 00:00:00+03'::timestamptz then raise exception 'sale_closed'; end if;
  if balance<299 then raise exception 'insufficient_coins'; end if;
  insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(player.id,-299,'shop_purchase','Адвент Dropso 2026') returning id into tx;
  insert into public.rewards_advent_purchases(user_id,transaction_id) values(player.id,tx);
  owned:=true; balance:=balance-299;
 elsif p_action='claim' then
  if p_day is null or p_day not between 1 and 31 then raise exception 'invalid_request'; end if;
  if not owned then raise exception 'purchase_required'; end if;
  select c.reward into reward from public.rewards_advent_claims c where c.user_id=player.id and c.day=p_day;
  if not found then
   if p_day>day_available or stamp>='2027-01-06 00:00:00+03'::timestamptz then raise exception 'day_closed'; end if;
   if amounts[p_day]>0 then
    insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(player.id,amounts[p_day],'adjustment','Адвент Dropso · день '||p_day) returning id into tx;
    reward:=jsonb_build_object('kind','coins','name',amounts[p_day]||' монет','amount',amounts[p_day],'transactionId',tx); balance:=balance+amounts[p_day];
   elsif p_day in(7,15,20,25) then
    select * into skin from public.rewards_advent_skins where day=p_day;
    if not found then raise exception 'advent_unavailable'; end if;
    insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins) values(skin.name,skin.image_url,'disabled',true,1,skin.price) returning id into prize;
    insert into public.rewards_wins(user_id,prize_id,won_at,delivery_status,choice_status,source_type,item_wear,item_variant_kind) values(player.id,prize,stamp,'awaiting_choice','awaiting_choice',case when p_day=20 then 'promo_upgrade' end,skin.wear,skin.variant_kind) returning id into win;
    reward:=jsonb_build_object('kind',case when p_day=20 then 'upgrader' else 'skin' end,'name',skin.name,'image',skin.image_url,'wear',skin.wear,'winId',win);
   elsif p_day in(4,12) then
    reward:=jsonb_build_object('kind','promo','name',case when p_day=4 then 'Промокод для «Трёх дверей»' else 'Промокод для Pick' end,'code','ADV26-'||upper(replace(gen_random_uuid()::text,'-','')));
   else
    select k,n into item,item_name from (values(2,'snowflake','Значок «Снежинка»'),(6,'winter_background','Зимний фон профиля'),(10,'cold_blood','Титул Cold Blood'),(14,'winter_frame','Новогодняя рамка'),(18,'snowfall','Эффект «Снегопад»'),(22,'winter_banner','Новогодний баннер'),(31,'gold_frame','Золотая рамка')) as items(d,k,n) where d=p_day;
    if item is null then raise exception 'invalid_request'; end if;
    insert into public.rewards_advent_cosmetics(user_id,item) values(player.id,item) on conflict do nothing;
    if p_day in(14,31) then update public.rewards_advent_cosmetics c set active=false where c.user_id=player.id and c.item=case when p_day=31 then 'winter_frame' else 'gold_frame' end; end if;
    reward:=jsonb_build_object('kind','exclusive','name',item_name,'item',item);
   end if;
   insert into public.rewards_advent_claims(user_id,day,reward) values(player.id,p_day,reward);
   if (select count(*) from public.rewards_advent_claims where user_id=player.id)=31 then
    insert into public.rewards_advent_cosmetics(user_id,item) values(player.id,'advent_drops_2026') on conflict do nothing;
   end if;
  end if;
 end if;
 return jsonb_build_object('purchased',owned,'availableDay',day_available,'saleOpen',ready and stamp<'2026-12-11 00:00:00+03'::timestamptz,'claimOpen',stamp<'2027-01-06 00:00:00+03'::timestamptz,'balance',balance,'reward',reward,'claimed',(select coalesce(jsonb_object_agg(c.day,c.reward),'{}'::jsonb) from public.rewards_advent_claims c where c.user_id=player.id),'completed',exists(select 1 from public.rewards_advent_cosmetics c where c.user_id=player.id and c.item='advent_drops_2026'));
end $$;
revoke all on function public.rewards_advent_2026(text,text,integer) from public,anon,authenticated;

grant execute on function public.rewards_advent_2026(text,text,integer) to service_role;

-- Administrative reporting is read-only and deliberately excludes personal promo codes.
create index rewards_advent_claims_recent_idx on public.rewards_advent_claims(claimed_at desc,user_id,day);
create index rewards_advent_purchases_recent_idx on public.rewards_advent_purchases(purchased_at desc,user_id);
create function public.rewards_advent_admin(p_actor text,p_action text,p_query text default '',p_page integer default 1,p_user uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare q text; total bigint; stats jsonb; entries jsonb; buyer jsonb; claims jsonb; recent jsonb;
begin
 if not exists(select 1 from public.rewards_admins where twitch_user_id=p_actor) then raise exception 'admin_required'; end if;
 if p_action not in ('list','detail') or p_action is null or p_page is null or p_page not between 1 and 100000 or char_length(coalesce(p_query,''))>80 then raise exception 'invalid_request'; end if;
 if p_action='list' then
  q:=lower(trim(coalesce(p_query,'')));
  select jsonb_build_object(
   'buyers',(select count(*) from public.rewards_advent_purchases),
   'spent',(select coalesce(sum(-t.amount),0) from public.rewards_advent_purchases p join public.rewards_coin_transactions t on t.id=p.transaction_id),
   'claimed',(select count(*) from public.rewards_advent_claims),
   'completed',(select count(*) from public.rewards_advent_cosmetics where item='advent_drops_2026'),
   'promosRedeemed',(select count(*) from public.rewards_advent_promo_redemptions),
   'saleEnabled',(select enabled from public.rewards_advent_settings where id=1)) into stats;
  select count(*) into total from public.rewards_advent_purchases p join public.rewards_users u on u.id=p.user_id where q='' or strpos(lower(coalesce(u.twitch_login,'')||' '||coalesce(u.twitch_display_name,'')),q)>0;
  select coalesce(jsonb_agg(to_jsonb(x) order by x."purchasedAt" desc,x."userId"),'[]'::jsonb) into entries from (
   select p.user_id as "userId",u.twitch_login as login,u.twitch_display_name as name,p.purchased_at as "purchasedAt",-t.amount as price,
    (select count(*) from public.rewards_advent_claims c where c.user_id=p.user_id) as claimed,
    (select max(c.claimed_at) from public.rewards_advent_claims c where c.user_id=p.user_id) as "lastClaimAt",
    exists(select 1 from public.rewards_advent_cosmetics c where c.user_id=p.user_id and c.item='advent_drops_2026') as completed
   from public.rewards_advent_purchases p join public.rewards_users u on u.id=p.user_id join public.rewards_coin_transactions t on t.id=p.transaction_id
   where q='' or strpos(lower(coalesce(u.twitch_login,'')||' '||coalesce(u.twitch_display_name,'')),q)>0
   order by p.purchased_at desc,p.user_id limit 25 offset (p_page-1)*25
  )x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x."claimedAt" desc,x."userId",x.day),'[]'::jsonb) into recent from (
   select c.user_id as "userId",u.twitch_login as login,u.twitch_display_name as name,c.day,c.claimed_at as "claimedAt",c.reward->>'name' as reward,
    case c.reward->>'kind' when 'coins' then 'wallet' when 'skin' then 'inventory' when 'upgrader' then 'upgrader' when 'promo' then 'game' when 'exclusive' then 'profile' end as destination
   from public.rewards_advent_claims c join public.rewards_users u on u.id=c.user_id
   where q='' or strpos(lower(coalesce(u.twitch_login,'')||' '||coalesce(u.twitch_display_name,'')),q)>0
   order by c.claimed_at desc,c.user_id,c.day limit 20)x;
  return jsonb_build_object('stats',stats,'buyers',entries,'recentClaims',recent,'total',total,'page',p_page,'pages',greatest(1,ceil(total/25.0)::integer));
 end if;
 if p_user is null then raise exception 'invalid_request'; end if;
 select jsonb_build_object('userId',p.user_id,'login',u.twitch_login,'name',u.twitch_display_name,'purchasedAt',p.purchased_at,'price',-t.amount,
  'transactionId',p.transaction_id,'completed',exists(select 1 from public.rewards_advent_cosmetics c where c.user_id=p.user_id and c.item='advent_drops_2026')) into buyer
 from public.rewards_advent_purchases p join public.rewards_users u on u.id=p.user_id join public.rewards_coin_transactions t on t.id=p.transaction_id where p.user_id=p_user;
 if not found then raise exception 'buyer_not_found'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('day',d.day,'claimedAt',c.claimed_at,'kind',c.reward->>'kind','name',c.reward->>'name','wear',c.reward->>'wear',
   'destination',case c.reward->>'kind' when 'coins' then 'wallet' when 'skin' then 'inventory' when 'upgrader' then 'upgrader' when 'promo' then 'game' when 'exclusive' then 'profile' end,
   'redeemedAt',r.redeemed_at,'cosmeticActive',e.active,'choiceStatus',w.choice_status,'deliveryStatus',w.delivery_status,
   'winId',w.id,'transactionId',c.reward->>'transactionId') order by d.day),'[]'::jsonb) into claims
 from generate_series(1,31) d(day)
 left join public.rewards_advent_claims c on c.user_id=p_user and c.day=d.day
 left join public.rewards_advent_promo_redemptions r on r.user_id=c.user_id and r.day=c.day
 left join public.rewards_advent_cosmetics e on e.user_id=c.user_id and e.item=c.reward->>'item'
 left join public.rewards_wins w on w.id::text=c.reward->>'winId' and w.user_id=c.user_id;
 return jsonb_build_object('buyer',buyer,'days',claims,'availableDay',greatest(0,least(31,1+floor(extract(epoch from (clock_timestamp()-'2026-12-01 00:00:00+03'::timestamptz))/86400)::integer)));
end $$;
revoke all on function public.rewards_advent_admin(text,text,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.rewards_advent_admin(text,text,text,integer,uuid) to service_role;
notify pgrst,'reload schema';

