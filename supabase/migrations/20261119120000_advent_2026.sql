-- Calendar receipts and entitlements are private. A sale is possible only after
-- all four fixed skin snapshots have been resolved and the operator enables it.
create table public.rewards_advent_settings(id integer primary key check(id=1), enabled boolean not null default false);
insert into public.rewards_advent_settings(id) values(1);
create table public.rewards_advent_skins(day integer primary key check(day in(7,15,20,25)),name text not null,image_url text not null,wear text,variant_kind text,price integer not null check(price>0 and price<=case day when 7 then 25 when 15 then 35 when 20 then 15 else 40 end));
create table public.rewards_advent_purchases(user_id uuid primary key references public.rewards_users(id),transaction_id uuid not null unique references public.rewards_coin_transactions(id),purchased_at timestamptz not null default clock_timestamp());
create table public.rewards_advent_claims(user_id uuid not null references public.rewards_advent_purchases(user_id),day integer not null check(day between 1 and 31),reward jsonb not null,claimed_at timestamptz not null default clock_timestamp(),primary key(user_id,day));
create unique index rewards_advent_code_unique on public.rewards_advent_claims((reward->>'code')) where reward ? 'code';
create table public.rewards_advent_promo_redemptions(user_id uuid not null,day integer not null,redeemed_at timestamptz not null default clock_timestamp(),primary key(user_id,day),foreign key(user_id,day) references public.rewards_advent_claims(user_id,day));
create table public.rewards_advent_cosmetics(user_id uuid not null references public.rewards_advent_purchases(user_id),item text not null,active boolean not null default true,primary key(user_id,item));
alter table public.rewards_advent_settings enable row level security;
alter table public.rewards_advent_skins enable row level security;
alter table public.rewards_advent_purchases enable row level security;
alter table public.rewards_advent_claims enable row level security;
alter table public.rewards_advent_promo_redemptions enable row level security;
alter table public.rewards_advent_cosmetics enable row level security;
revoke all on public.rewards_advent_settings,public.rewards_advent_skins,public.rewards_advent_purchases,public.rewards_advent_claims,public.rewards_advent_cosmetics from public,anon,authenticated;
grant select on public.rewards_advent_settings,public.rewards_advent_skins to service_role;
grant select,insert on public.rewards_advent_purchases,public.rewards_advent_claims to service_role;
revoke all on public.rewards_advent_promo_redemptions from public,anon,authenticated;
grant select,insert on public.rewards_advent_promo_redemptions to service_role;
grant select,insert,update on public.rewards_advent_cosmetics to service_role;

-- Snapshot four fixed existing variants once, preferring the closest price
-- below each day's ceiling. The operator can review the names before enabling.
do $$
declare slot record;
begin
 for slot in select * from (values (7,25),(15,35),(20,15),(25,40)) as slots(day,budget) loop
  insert into public.rewards_advent_skins(day,name,image_url,wear,variant_kind,price)
  select slot.day,i.name,i.image_url,v.wear,v.variant_kind,v.price_coins
  from public.rewards_shop_item_variants v join public.rewards_shop_items i on i.id=v.shop_item_id
  where v.available and i.status='available' and (i.stock is null or i.stock>0) and i.image_url is not null and v.price_coins between 1 and slot.budget
  and not exists(select 1 from public.rewards_advent_skins s where s.name=i.name)
  order by v.price_coins desc,i.name,v.wear,v.variant_kind,i.id limit 1;
 end loop;
end $$;

create function public.rewards_advent_2026(p_actor text,p_action text,p_day integer default null) returns jsonb
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
    insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(player.id,amounts[p_day],'adjustment','Адвент Dropso · день '||p_day);
    reward:=jsonb_build_object('kind','coins','name',amounts[p_day]||' монет'); balance:=balance+amounts[p_day];
   elsif p_day in(7,15,20,25) then
    select * into skin from public.rewards_advent_skins where day=p_day;
    if not found then raise exception 'advent_unavailable'; end if;
    insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins) values(skin.name,skin.image_url,'disabled',true,1,skin.price) returning id into prize;
    insert into public.rewards_wins(user_id,prize_id,won_at,delivery_status,choice_status,source_type,item_wear,item_variant_kind) values(player.id,prize,stamp,'awaiting_choice','awaiting_choice',case when p_day=20 then 'promo_upgrade' end,skin.wear,skin.variant_kind) returning id into win;
    reward:=jsonb_build_object('kind',case when p_day=20 then 'upgrader' else 'skin' end,'name',skin.name,'image',skin.image_url,'wear',skin.wear);
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
create function public.rewards_advent_redeem(p_actor text,p_code text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare player public.rewards_users%rowtype; claim public.rewards_advent_claims%rowtype;
begin
 select * into player from public.rewards_users where twitch_user_id=p_actor for update;
 if not found or coalesce(player.banned,false) or coalesce(player.participation_restricted,false) then raise exception 'user_unavailable'; end if;
 select * into claim from public.rewards_advent_claims where user_id=player.id and day in(4,12) and reward->>'code'=upper(trim(p_code));
 if not found then raise exception 'promo_not_found'; end if;
 if exists(select 1 from public.rewards_advent_promo_redemptions where user_id=player.id and day=claim.day) then raise exception 'already_used'; end if;
 insert into public.rewards_promo_game_credits as c(user_id,game,stake,balance) values(player.id,case when claim.day=4 then 'three_doors' else 'pick' end,case when claim.day=4 then 10 else 0 end,case when claim.day=4 then 1 else 15 end) on conflict(user_id,game,stake) do update set balance=c.balance+excluded.balance;
 insert into public.rewards_advent_promo_redemptions(user_id,day) values(player.id,claim.day);
 return jsonb_build_object('ok',true,'rewardType',case when claim.day=4 then 'three_doors_pass' else 'pick_credit' end,'amount',case when claim.day=4 then 10 else 15 end);
end $$;
revoke all on function public.rewards_advent_redeem(text,text) from public,anon,authenticated;
grant execute on function public.rewards_advent_redeem(text,text) to service_role;
-- Only active cosmetics are public; the owner's full entitlement list stays private.
create function public.rewards_advent_styles(p_logins text[]) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
 select u.twitch_login as login,array_agg(c.item order by c.item) as items from public.rewards_advent_cosmetics c join public.rewards_users u on u.id=c.user_id
 where c.active and u.twitch_login=any(p_logins) and array_length(p_logins,1)<=24 and not coalesce(u.banned,false) group by u.twitch_login)x;
$$;
create function public.rewards_advent_collection(p_actor text,p_item text default null,p_active boolean default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare player public.rewards_users%rowtype;
begin
 select * into player from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable'; end if;
 if p_item is not null then
  if p_active is null or p_item='advent_drops_2026' then raise exception 'invalid_request'; end if;
  update public.rewards_advent_cosmetics set active=p_active where user_id=player.id and item=p_item;
  if not found then raise exception 'invalid_request'; end if;
  if p_active and p_item in('gold_frame','winter_frame') then update public.rewards_advent_cosmetics set active=false where user_id=player.id and item in('gold_frame','winter_frame') and item<>p_item; end if;
 end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('item',c.item,'active',c.active,'name',case when c.item='advent_drops_2026' then 'Advent Drops 2026' else (select a.reward->>'name' from public.rewards_advent_claims a where a.user_id=player.id and a.reward->>'item'=c.item limit 1) end) order by c.item),'[]'::jsonb) from public.rewards_advent_cosmetics c where c.user_id=player.id);
end $$;
revoke all on function public.rewards_advent_styles(text[]),public.rewards_advent_collection(text,text,boolean) from public,anon,authenticated;
grant execute on function public.rewards_advent_styles(text[]),public.rewards_advent_collection(text,text,boolean) to service_role;
notify pgrst,'reload schema';
