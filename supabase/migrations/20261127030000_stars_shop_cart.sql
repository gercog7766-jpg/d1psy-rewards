-- Discounted checkout is atomic and the awarded item cannot be resold above its paid value.
create table public.rewards_stars_shop_cart_receipts(user_id uuid references public.rewards_users(id),request_id uuid,items jsonb not null,expected_total int,result jsonb not null,created_at timestamptz not null default now(),primary key(user_id,request_id));
create table public.rewards_stars_shop_prizes(item_id uuid not null,variant_id uuid,paid int not null check(paid>0),prize_id uuid not null unique references public.rewards_prizes(id),unique nulls not distinct(item_id,variant_id,paid));
alter table public.rewards_stars_shop_cart_receipts enable row level security;
alter table public.rewards_stars_shop_prizes enable row level security;
revoke all on public.rewards_stars_shop_cart_receipts,public.rewards_stars_shop_prizes from public,anon,authenticated;
grant select,insert on public.rewards_stars_shop_cart_receipts,public.rewards_stars_shop_prizes to service_role;

create function public.rewards_stars_purchase_cart(p_user uuid,p_request uuid,p_items jsonb,p_expected_total int default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare i public.rewards_shop_items; v public.rewards_shop_item_variants; prev public.rewards_stars_shop_cart_receipts; x record; staged jsonb:='[]';unit int; base int; count_units int:=0; total bigint:=0; discount int; remaining int; v_paid int; pct int; balance bigint; label text; prize uuid; win uuid; wins jsonb:='[]'; result jsonb; n int;
begin
 if p_request is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'invalid_request';end if;
 if exists(select 1 from jsonb_to_recordset(p_items) as r(item_id uuid,variant_id uuid,qty int,expected_price int) where r.item_id is null or r.qty is null or r.qty not between 1 and 99 or (r.expected_price is not null and r.expected_price<1)) or (select count(*) from jsonb_to_recordset(p_items) as r(item_id uuid,variant_id uuid))<>(select count(distinct (r.item_id,r.variant_id)) from jsonb_to_recordset(p_items) as r(item_id uuid,variant_id uuid)) then raise exception 'invalid_request';end if;
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;if not found then raise exception 'user_not_found';end if;
 select * into prev from public.rewards_stars_shop_cart_receipts where user_id=p_user and request_id=p_request;if found then if prev.items is distinct from p_items or prev.expected_total is distinct from p_expected_total then raise exception 'request_conflict';end if;return prev.result;end if;
 pct:=public.rewards_stars_discount_percent(p_user,'shop');
 if pct=0 then raise exception 'discount_unavailable';end if;
 for x in select * from jsonb_to_recordset(p_items) as r(item_id uuid,variant_id uuid,qty int,expected_price int) order by item_id,variant_id loop
  select * into i from public.rewards_shop_items where id=x.item_id and status='available' for update;if not found then raise exception 'item_not_available';end if;
  select coalesce(sum(r.qty),0) into n from jsonb_to_recordset(p_items) as r(item_id uuid,qty int) where r.item_id=i.id;if i.stock is not null and i.stock<n then raise exception 'out_of_stock';end if;
  base:=i.price_coins;label:=i.name;v:=null;
  if x.variant_id is not null then select * into v from public.rewards_shop_item_variants where id=x.variant_id and shop_item_id=i.id and available for update;if not found or v.price_coins is null then raise exception 'variant_not_available';end if;base:=v.price_coins;label:=case v.variant_kind when 'stattrak' then 'StatTrak™ ' when 'souvenir' then 'Сувенирный ' else '' end||i.name;end if;
  if base is null or base<1 or (x.expected_price is not null and x.expected_price<>base) then raise exception 'price_changed';end if;
  count_units:=count_units+x.qty;total:=total+base::bigint*x.qty;if count_units>100 or total>2147483647 then raise exception 'invalid_request';end if;
  staged:=staged||jsonb_build_array(jsonb_build_object('item_id',i.id,'variant_id',x.variant_id,'qty',x.qty,'base',base,'name',label,'image',i.image_url,'wear',v.wear,'kind',v.variant_kind));
 end loop;
 -- Keep every awarded item worth at least one coin, even for legacy one-coin products.
 discount:=least(total*pct/100,total-count_units)::int;remaining:=discount;
 if p_expected_total is not null and p_expected_total<>total-discount then raise exception 'price_changed';end if;
 select coalesce(sum(amount),0) into balance from public.rewards_coin_transactions where user_id=p_user;if balance<total-discount then raise exception 'insufficient_coins';end if;
 -- Ordered allocation is deterministic. Sum of per-item paid values equals the cart debit.
 for x in select * from jsonb_to_recordset(staged) as r(item_id uuid,variant_id uuid,qty int,base int,name text,image text,wear text,kind text) order by r.base desc,r.item_id,r.variant_id loop
  update public.rewards_shop_items set stock=stock-x.qty,updated_at=now() where id=x.item_id and stock is not null;
  for unit in 1..x.qty loop
   n:=least(remaining,x.base-1,ceil(x.base*pct/100.0)::int);v_paid:=x.base-n;remaining:=remaining-n;
   select prize_id into prize from public.rewards_stars_shop_prizes where item_id=x.item_id and variant_id is not distinct from x.variant_id and rewards_stars_shop_prizes.paid=v_paid;
   if not found then
    insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins) values(x.name,x.image,'disabled',true,1,v_paid) returning id into prize;
    insert into public.rewards_stars_shop_prizes(item_id,variant_id,paid,prize_id) values(x.item_id,x.variant_id,v_paid,prize);
   end if;
   insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user,-v_paid,'shop_purchase','shop_item:'||x.item_id::text||case when x.variant_id is not null then ';variant:'||x.variant_id::text else '' end||';cart:'||p_request::text);
   insert into public.rewards_wins(round_id,user_id,prize_id,delivery_status,choice_status,won_at,item_wear,item_variant_kind,source_type) values(null,p_user,prize,'awaiting_choice','awaiting_choice',now(),x.wear,x.kind,'shop') returning id into win;
   wins:=wins||jsonb_build_array(win);
  end loop;
 end loop;
 if remaining<>0 then raise exception 'discount_allocation_failed';end if;
 result:=jsonb_build_object('ok',true,'count',count_units,'base',total,'discount',discount,'paid',total-discount,'wins',wins);
 insert into public.rewards_stars_shop_cart_receipts(user_id,request_id,items,expected_total,result) values(p_user,p_request,p_items,p_expected_total,result);return result;
end $$;
revoke all on function public.rewards_stars_purchase_cart(uuid,uuid,jsonb,int) from public,anon,authenticated;
grant execute on function public.rewards_stars_purchase_cart(uuid,uuid,jsonb,int) to service_role;

-- Preserve historical single-item RPCs for free users; paid single-item purchases
-- use the same accounting and snapshot path, including the legacy account UI.
do $$
declare definition text; guard text:='begin';f regprocedure;
begin
 foreach f in array array['public.rewards_purchase_shop_item(uuid,uuid)'::regprocedure,'public.rewards_purchase_shop_item_variant(uuid,uuid,uuid)'::regprocedure] loop
  select pg_get_functiondef(f) into definition;
  if strpos(definition,'perform 1 from public.rewards_users where id=p_user_id for update;')=0 or strpos(definition,'return v_win;')=0 then raise exception 'unexpected_shop_purchase_definition';end if;
  definition:=replace(definition,'perform 1 from public.rewards_users where id=p_user_id for update;', 'if public.rewards_stars_discount_percent(p_user_id,''shop'')>0 then return (public.rewards_stars_purchase_cart(p_user_id,gen_random_uuid(),jsonb_build_array(jsonb_build_object(''item_id'',p_shop_item_id,''variant_id'','||case when f='public.rewards_purchase_shop_item_variant(uuid,uuid,uuid)'::regprocedure then 'p_variant_id' else 'null::uuid' end||',''qty'',1)),null)->''wins''->>0)::uuid;end if; perform 1 from public.rewards_users where id=p_user_id for update;');
  execute definition;
 end loop;
end $$;
notify pgrst,'reload schema';
