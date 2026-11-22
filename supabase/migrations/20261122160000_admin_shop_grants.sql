create table public.rewards_admin_shop_grants(request_id uuid primary key,actor text not null,user_id uuid not null,shop_item_id uuid not null,variant_id uuid,win_id uuid not null,created_at timestamptz not null default now());
alter table public.rewards_admin_shop_grants enable row level security;
revoke all on public.rewards_admin_shop_grants from public,anon,authenticated;
grant select,insert on public.rewards_admin_shop_grants to service_role;
create function public.rewards_admin_grant_shop_skin(p_actor text,p_user uuid,p_item uuid,p_variant uuid,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.rewards_shop_items; v public.rewards_shop_item_variants; receipt public.rewards_admin_shop_grants; prize uuid; win uuid; price integer; wear text; kind text;
begin
 if not exists(select 1 from public.rewards_admins where twitch_user_id=p_actor) then raise exception 'admin_required';end if;
 if p_request is null or p_user is null or p_item is null then raise exception 'invalid_input';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into receipt from public.rewards_admin_shop_grants where request_id=p_request;
 if found then if receipt.actor<>p_actor or receipt.user_id<>p_user or receipt.shop_item_id<>p_item or receipt.variant_id is distinct from p_variant then raise exception 'invalid_input';end if;return jsonb_build_object('ok',true,'winId',receipt.win_id);end if;
 if not exists(select 1 from public.rewards_users where id=p_user) then raise exception 'user_not_found';end if;
 select * into i from public.rewards_shop_items where id=p_item and status='available' and (stock is null or stock>0) for share;
 if not found then raise exception 'item_not_available';end if;
 if p_variant is not null then select * into v from public.rewards_shop_item_variants where id=p_variant and shop_item_id=i.id and available and price_coins>0 for share;if not found then raise exception 'variant_not_available';end if;price:=v.price_coins;wear:=v.wear;kind:=v.variant_kind;
 else if exists(select 1 from public.rewards_shop_item_variants where shop_item_id=i.id) then raise exception 'variant_required';end if;price:=i.price_coins;end if;
 if price is null or price<=0 then raise exception 'item_not_available';end if;
 insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins) values(i.name,i.image_url,'disabled',true,1,price) returning id into prize;
 insert into public.rewards_wins(user_id,prize_id,won_at,delivery_status,choice_status,item_wear,item_variant_kind) values(p_user,prize,clock_timestamp(),'awaiting_choice','awaiting_choice',wear,kind) returning id into win;
 insert into public.rewards_admin_shop_grants(request_id,actor,user_id,shop_item_id,variant_id,win_id) values(p_request,p_actor,p_user,p_item,p_variant,win);
 return jsonb_build_object('ok',true,'winId',win);
end$$;
revoke all on function public.rewards_admin_grant_shop_skin(text,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.rewards_admin_grant_shop_skin(text,uuid,uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';
