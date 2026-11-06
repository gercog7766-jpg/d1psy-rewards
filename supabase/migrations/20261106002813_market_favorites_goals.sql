-- Personal shop preferences only. No reservations, purchases or coin writes.
create table public.rewards_market_favorites (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.rewards_users(id) on delete cascade,
 variant_id uuid references public.rewards_shop_item_variants(id) on delete cascade,
 fixed_item_id uuid references public.rewards_shop_items(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 check(num_nonnulls(variant_id,fixed_item_id)=1),
 unique(user_id,variant_id),unique(user_id,fixed_item_id),unique(id,user_id)
);
create table public.rewards_market_goals (
 user_id uuid primary key references public.rewards_users(id) on delete cascade,
 favorite_id uuid not null,
 updated_at timestamptz not null default clock_timestamp(),
 foreign key(favorite_id,user_id) references public.rewards_market_favorites(id,user_id) on delete cascade
);
alter table public.rewards_market_favorites enable row level security;
alter table public.rewards_market_goals enable row level security;
revoke all on public.rewards_market_favorites,public.rewards_market_goals from public,anon,authenticated;
grant select,insert,update,delete on public.rewards_market_favorites,public.rewards_market_goals to service_role;

-- Preserve legacy whole-item favorites by selecting the normal FT variant when
-- possible, otherwise an available variant. Fixed-price items stay fixed-price.
insert into public.rewards_market_favorites(user_id,variant_id,fixed_item_id)
 select f.user_id,v.id,case when v.id is null then f.shop_item_id end
 from public.rewards_shop_favorites f
 left join lateral(select id from public.rewards_shop_item_variants where shop_item_id=f.shop_item_id
   order by available desc,(variant_kind='normal') desc,(wear='FT') desc,price_coins nulls last,id limit 1)v on true
 on conflict do nothing;

create function public.rewards_market_state(p_user uuid) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object(
 'balance',(select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=p_user),
 'goalFavoriteId',(select favorite_id from public.rewards_market_goals where user_id=p_user),
 'favorites',coalesce((select jsonb_agg(jsonb_build_object(
  'id',f.id,'itemId',i.id,'variantId',v.id,'name',i.name,'image',i.image_url,
  'wear',v.wear,'kind',coalesce(v.variant_kind,'normal'),
  'price',case when v.id is null then i.price_coins else v.price_coins end,
  'available',i.status='available' and (i.stock is null or i.stock>0) and
    case when v.id is null then i.price_coins>0 else v.available and coalesce(v.price_coins,0)>0 end,
  'createdAt',f.created_at) order by f.created_at desc,f.id)
 from public.rewards_market_favorites f
 left join public.rewards_shop_item_variants v on v.id=f.variant_id
 join public.rewards_shop_items i on i.id=coalesce(v.shop_item_id,f.fixed_item_id)
 where f.user_id=p_user),'[]'::jsonb));
$$;

create function public.rewards_market_set(p_user uuid,p_action text,p_item uuid default null,p_variant uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare fav uuid; item_status text; variant_item uuid;
begin
 if p_action is null or p_action not in('favorite','unfavorite','goal','clear_goal') then raise exception 'invalid_action';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('market:'||p_user::text,0));
 perform 1 from public.rewards_users where id=p_user;
 if not found then raise exception 'user_not_found';end if;
 if p_action='clear_goal' then
  delete from public.rewards_market_goals where user_id=p_user;
  return public.rewards_market_state(p_user);
 end if;
 if p_item is null then raise exception 'item_not_found';end if;
 if p_variant is not null then
  select shop_item_id into variant_item from public.rewards_shop_item_variants where id=p_variant;
  if not found or variant_item<>p_item then raise exception 'variant_not_found';end if;
  select id into fav from public.rewards_market_favorites where user_id=p_user and variant_id=p_variant;
 else
  select id into fav from public.rewards_market_favorites where user_id=p_user and fixed_item_id=p_item;
 end if;
 if p_action='unfavorite' then
  delete from public.rewards_market_favorites where id=fav and user_id=p_user;
  return public.rewards_market_state(p_user);
 end if;
 select status into item_status from public.rewards_shop_items where id=p_item;
 if not found then raise exception 'item_not_found';end if;
 if item_status<>'available' and fav is null then raise exception 'item_unavailable';end if;
 if p_variant is null and exists(select 1 from public.rewards_shop_item_variants where shop_item_id=p_item) then raise exception 'choose_variant';end if;
 if fav is null then
  if (select count(*) from public.rewards_market_favorites where user_id=p_user)>=500 then raise exception 'favorites_limit';end if;
  insert into public.rewards_market_favorites(user_id,variant_id,fixed_item_id)
   values(p_user,p_variant,case when p_variant is null then p_item end) returning id into fav;
 end if;
 if p_action='goal' then
  insert into public.rewards_market_goals(user_id,favorite_id) values(p_user,fav)
   on conflict(user_id) do update set favorite_id=excluded.favorite_id,updated_at=clock_timestamp();
 end if;
 return public.rewards_market_state(p_user);
end; $$;
revoke all on function public.rewards_market_state(uuid),public.rewards_market_set(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.rewards_market_state(uuid),public.rewards_market_set(uuid,text,uuid,uuid) to service_role;
