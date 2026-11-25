-- Isolated, server-side test ledger. Never grants production benefits or touches balances.
create table public.rewards_monetization_test_orders (
 id uuid primary key default gen_random_uuid(),
 actor text not null,
 request_id uuid not null,
 product text not null check(product in('lite','plus','battlePass')),
 currency text not null default 'XTR' check(currency='XTR'),
 stars integer not null check(stars between 1 and 100000),
 days integer not null check(days between 1 and 365),
 season text not null default '',
 state text not null default 'pending' check(state in('pending','approved','paid','refunded')),
 charge_id text unique,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '15 minutes',
 paid_at timestamptz,
 refunded_at timestamptz,
 unique(actor,request_id),
 check((state in('pending','approved') and charge_id is null and paid_at is null and refunded_at is null) or (state='paid' and charge_id is not null and paid_at is not null and refunded_at is null) or (state='refunded' and charge_id is not null and paid_at is not null and refunded_at is not null))
);
create index rewards_monetization_test_actor_idx on public.rewards_monetization_test_orders(actor,created_at desc);
alter table public.rewards_monetization_test_orders enable row level security;
revoke all on public.rewards_monetization_test_orders from public,anon,authenticated;
grant select,insert,update on public.rewards_monetization_test_orders to service_role;

create function public.rewards_monetization_test_action(p_actor text,p_action text,p_body jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.rewards_monetization_test_orders; cfg jsonb; p jsonb; product_key text; req uuid; charge text; stamp timestamptz:=clock_timestamp();
begin
 if not exists(select 1 from public.rewards_admins where twitch_user_id=p_actor) then raise exception 'admin_required';end if;
 if jsonb_typeof(p_body) is distinct from 'object' then raise exception 'invalid_request';end if;
 -- Serialize one administrator's test orders, without locking ordinary application data.
 perform pg_advisory_xact_lock(hashtextextended('monetization-test:'||p_actor,0));
 if p_action='create' then
  product_key:=p_body->>'product';req:=(p_body->>'requestId')::uuid;
  if product_key is null or product_key not in('lite','plus','battlePass') or req is null then raise exception 'invalid_request';end if;
  select * into o from public.rewards_monetization_test_orders where actor=p_actor and request_id=req;
  if found then if o.product<>product_key then raise exception 'request_conflict';end if;return to_jsonb(o);end if;
  select config into cfg from public.rewards_monetization_draft where id;
  p:=cfg->product_key;
  if p is null or p->>'visibility' is distinct from 'admin_test' then raise exception 'product_not_in_test';end if;
  if (select count(*) from public.rewards_monetization_test_orders where actor=p_actor and created_at>stamp-interval '1 hour')>=30 then raise exception 'test_rate_limit';end if;
  if product_key='battlePass' and exists(select 1 from public.rewards_monetization_test_orders where actor=p_actor and product=product_key and state in('pending','approved','paid') and season=p->>'season' and (state='paid' or expires_at>stamp)) then raise exception 'pass_already_owned_or_pending';end if;
  insert into public.rewards_monetization_test_orders(actor,request_id,product,stars,days,season) values(p_actor,req,product_key,(p->>'stars')::integer,case when product_key='battlePass' then (p->>'days')::integer else 30 end,case when product_key='battlePass' then p->>'season' else '' end) returning * into o;
  return to_jsonb(o);
 end if;
 select * into o from public.rewards_monetization_test_orders where id=(p_body->>'orderId')::uuid and actor=p_actor for update;
 if not found then raise exception 'order_not_found';end if;
 if p_action='precheckout' then
  if p_body->>'currency' is distinct from o.currency or (p_body->>'stars')::integer is distinct from o.stars then raise exception 'amount_mismatch';end if;
  if not exists(select 1 from public.rewards_monetization_draft where id and config->o.product->>'visibility'='admin_test') then raise exception 'product_not_in_test';end if;
  if o.expires_at<=stamp or o.state not in('pending','approved') then raise exception 'order_not_payable';end if;
  if o.state='pending' then update public.rewards_monetization_test_orders set state='approved' where id=o.id returning * into o;end if;
 elsif p_action='receipt' then
  charge:=p_body->>'chargeId';
  if charge is null or charge !~ '^test_[a-f0-9]{32}$' or p_body->>'currency' is distinct from o.currency or (p_body->>'stars')::integer is distinct from o.stars then raise exception 'invalid_receipt';end if;
  if o.state in('paid','refunded') then if o.charge_id is distinct from charge then raise exception 'request_conflict';end if;return to_jsonb(o);end if;
  if o.state<>'approved' then raise exception 'order_not_approved';end if;
  update public.rewards_monetization_test_orders set state='paid',charge_id=charge,paid_at=stamp where id=o.id returning * into o;
 elsif p_action='refund' then
  if o.state='refunded' then return to_jsonb(o);end if;
  if o.state<>'paid' then raise exception 'order_not_paid';end if;
  update public.rewards_monetization_test_orders set state='refunded',refunded_at=stamp where id=o.id returning * into o;
 else raise exception 'invalid_request';end if;
 return to_jsonb(o);
end$$;
revoke all on function public.rewards_monetization_test_action(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_monetization_test_action(text,text,jsonb) to service_role;
notify pgrst,'reload schema';
