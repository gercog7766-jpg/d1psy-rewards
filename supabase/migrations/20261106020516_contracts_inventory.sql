-- Atomic exchange; only the trusted server role can invoke this RPC.
create table public.rewards_contracts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.rewards_users(id),
 request_id uuid not null,
 source_win_ids uuid[] not null,
 source_value_coins bigint not null check(source_value_coins>0),
 rolled_percent integer not null check(rolled_percent between 30 and 200),
 reward_win_id uuid not null references public.rewards_wins(id),
 result jsonb not null,
 created_at timestamptz not null default now(),
 unique(user_id,request_id)
);
alter table public.rewards_contracts enable row level security;
revoke all on public.rewards_contracts from public,anon,authenticated;
grant select,insert on public.rewards_contracts to service_role;
alter table public.rewards_wins drop constraint rewards_wins_choice_status_check;
alter table public.rewards_wins add constraint rewards_wins_choice_status_check
 check(choice_status in ('awaiting_choice','claimed','sold','upgraded','contracted'));
create function public.rewards_run_contract(p_user_id uuid,p_source_win_ids uuid[],p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 ids uuid[]; old public.rewards_contracts; s record; v record;
 n integer:=0; total bigint:=0; roll integer; pct integer;
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
 roll:=floor(random()*100)::integer;
 pct:=case when roll<55 then 30+floor(random()*51)::integer
  when roll<80 then 81+floor(random()*25)::integer
  when roll<95 then 106+floor(random()*45)::integer
  else 151+floor(random()*50)::integer end;
 -- Catalog prices are discrete: choose the nearest available variant to the roll,
 -- always within 30–200% of the input value. No suitable result means no writes.
 select sv.id,sv.price_coins,sv.wear,sv.variant_kind,si.name,si.image_url into v
 from public.rewards_shop_item_variants sv join public.rewards_shop_items si on si.id=sv.shop_item_id
 where sv.available and si.status='available' and (si.stock is null or si.stock>0)
 and sv.price_coins>0 and sv.price_coins::numeric between total*0.30 and total*2.00
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
