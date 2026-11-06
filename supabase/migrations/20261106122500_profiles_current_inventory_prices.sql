-- Public profiles show only items still held on the site, with coin value.
create or replace function public.rewards_user_profile(p_viewer uuid,p_login text,p_page integer default 1) returns jsonb language plpgsql security invoker set search_path='' as $$
declare target public.rewards_users; base jsonb; inventory jsonb; total integer; actual_page integer;
begin
 if not exists(select 1 from public.rewards_users where id=p_viewer and not coalesce(banned,false)) then raise exception 'user_unavailable';end if;
 -- A privacy change waits for this shared row lock, so one response is consistent.
 select * into target from public.rewards_users where lower(twitch_login)=lower(p_login) and not coalesce(banned,false) for share;
 if not found then raise exception 'profile_not_found';end if;
 base:=jsonb_build_object('login',target.twitch_login,'name',coalesce(nullif(target.twitch_display_name,''),target.twitch_login),'avatar',target.twitch_avatar_url,'online',public.rewards_user_online(target.id),'isPrivate',target.profile_private,'isSelf',target.id=p_viewer);
 if target.profile_private and target.id<>p_viewer then return base||jsonb_build_object('inventoryHidden',true);end if;
 -- Exclude sold/used items; legacy shop orders without a linked win remain visible.
 with items as(
  select w.id,w.won_at acquired,p.name,p.image_url,w.item_wear wear,w.item_variant_kind kind,p.sell_price_coins price from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id
  where w.user_id=target.id and coalesce(w.choice_status,'') not in('sold','upgraded','contracted') and w.delivery_status in('pending','awaiting_choice') and w.delivered_at is null and not exists(select 1 from public.rewards_orders shipped where shipped.win_id=w.id and shipped.status='sent')
  union all
  select o.id,o.created_at,o.item_name,o.image_url,o.item_wear,o.item_variant_kind,o.price_coins from public.rewards_orders o
  where o.user_id=target.id and o.source_type='shop' and o.status='pending' and o.win_id is null
 )select count(*) into total from items;
 actual_page:=least(greatest(coalesce(p_page,1),1),greatest(1,ceil(total/24.0)::integer));
 with items as(
  select w.id,w.won_at acquired,p.name,p.image_url,w.item_wear wear,w.item_variant_kind kind,p.sell_price_coins price from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id
  where w.user_id=target.id and coalesce(w.choice_status,'') not in('sold','upgraded','contracted') and w.delivery_status in('pending','awaiting_choice') and w.delivered_at is null and not exists(select 1 from public.rewards_orders shipped where shipped.win_id=w.id and shipped.status='sent')
  union all
  select o.id,o.created_at,o.item_name,o.image_url,o.item_wear,o.item_variant_kind,o.price_coins from public.rewards_orders o
  where o.user_id=target.id and o.source_type='shop' and o.status='pending' and o.win_id is null
 )select coalesce(jsonb_agg(jsonb_build_object('name',x.name,'image',x.image_url,'wear',x.wear,'kind',x.kind,'priceCoins',x.price) order by x.acquired desc,x.id),'[]'::jsonb) into inventory from(select * from items order by acquired desc,id limit 24 offset (actual_page-1)*24)x;
 return base||jsonb_build_object('inventoryHidden',false,'items',inventory,'total',total,'page',actual_page,'pages',greatest(1,ceil(total/24.0)::integer));
end $$;
