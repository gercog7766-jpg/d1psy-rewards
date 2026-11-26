-- Real Telegram Stars receipts are never mixed with synthetic test orders.
-- Checkout remains disabled until actual fulfillment and support are ready.
create table public.rewards_stars_pilot_control(
 id boolean primary key default true check(id),enabled boolean not null default false,
 fulfillment_ready boolean not null default false,support_url text,
 check(not enabled or (fulfillment_ready and support_url is not null and support_url like 'https://%'))
);
insert into public.rewards_stars_pilot_control(id) values(true);
create table public.rewards_stars_pilot_orders(
 id uuid primary key default gen_random_uuid(),actor text not null,telegram_id text not null,
 request_id uuid not null,product text not null check(product in('lite','plus','battlePass')),
 stars integer not null check(stars between 1 and 100000),currency text not null default 'XTR' check(currency='XTR'),
 days integer not null check(days between 1 and 365),season text not null default '',
 state text not null default 'pending' check(state in('pending','approved','paid','refunded')),
 approval_id text unique,charge_id text unique,created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '15 minutes',approved_at timestamptz,paid_at timestamptz,refunded_at timestamptz,refund_requested_at timestamptz,
 unique(actor,request_id),check(telegram_id~'^[1-9][0-9]{0,15}$'),
 check((state='pending' and approval_id is null and approved_at is null and charge_id is null and paid_at is null and refunded_at is null) or (state='approved' and approval_id is not null and approved_at is not null and charge_id is null and paid_at is null and refunded_at is null) or (state='paid' and approval_id is not null and approved_at is not null and charge_id is not null and paid_at is not null and refunded_at is null) or (state='refunded' and approval_id is not null and approved_at is not null and charge_id is not null and paid_at is not null and refunded_at is not null))
);
create index rewards_stars_pilot_actor_idx on public.rewards_stars_pilot_orders(actor,created_at desc);
alter table public.rewards_stars_pilot_control enable row level security;
alter table public.rewards_stars_pilot_orders enable row level security;
revoke all on public.rewards_stars_pilot_control,public.rewards_stars_pilot_orders from public,anon,authenticated;
grant select on public.rewards_stars_pilot_control to service_role;
grant select,insert,update on public.rewards_stars_pilot_orders to service_role;

create function public.rewards_stars_pilot_action(p_telegram_id text,p_action text,p_body jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.rewards_stars_pilot_orders;actor_id text;cfg jsonb;product_key text;req uuid;charge text;approval text;stamp timestamptz:=clock_timestamp();
begin
 if p_telegram_id is null or p_telegram_id!~'^[1-9][0-9]{0,15}$' or jsonb_typeof(p_body) is distinct from 'object' then raise exception 'invalid_request';end if;
 if p_action in('create','precheckout','prepare_refund') then
  select u.twitch_user_id into actor_id from public.rewards_bonus_telegram_links l join public.rewards_users u on u.id=l.user_id join public.rewards_admins a on a.twitch_user_id=u.twitch_user_id where l.telegram_id=p_telegram_id and not coalesce(u.banned,false);
  if actor_id is null then raise exception 'admin_required';end if;
 end if;
 if p_action in('create','precheckout') and not exists(select 1 from public.rewards_stars_pilot_control where id and enabled and fulfillment_ready and support_url is not null) then raise exception 'pilot_disabled';end if;
 if p_action='create' then
  product_key:=p_body->>'product';req:=(p_body->>'requestId')::uuid;
  if product_key is null or product_key not in('lite','plus','battlePass') or req is null then raise exception 'invalid_request';end if;
  perform pg_advisory_xact_lock(hashtextextended('stars-pilot:'||actor_id,0));
  select * into o from public.rewards_stars_pilot_orders where actor=actor_id and request_id=req;
  if found then if o.product<>product_key or o.telegram_id<>p_telegram_id then raise exception 'request_conflict';end if;return to_jsonb(o);end if;
  select config->product_key into cfg from public.rewards_monetization_draft where id;
  if cfg is null or cfg->>'visibility' is distinct from 'admin_test' then raise exception 'product_not_in_test';end if;
  if (select count(*) from public.rewards_stars_pilot_orders where actor=actor_id and created_at>stamp-interval '1 hour')>=10 then raise exception 'rate_limit';end if;
  if exists(select 1 from public.rewards_stars_pilot_orders where actor=actor_id and product=product_key and ((state='pending' and expires_at>stamp) or state='approved' or (product_key='battlePass' and season=cfg->>'season' and state='paid'))) then raise exception 'order_already_exists';end if;
  insert into public.rewards_stars_pilot_orders(actor,telegram_id,request_id,product,stars,days,season) values(actor_id,p_telegram_id,req,product_key,(cfg->>'stars')::int,case when product_key='battlePass' then (cfg->>'days')::int else 30 end,case when product_key='battlePass' then cfg->>'season' else '' end) returning * into o;
  return to_jsonb(o);
 end if;
 select * into o from public.rewards_stars_pilot_orders where id=(p_body->>'orderId')::uuid and telegram_id=p_telegram_id for update;
 if not found then raise exception 'order_not_found';end if;
 if p_action in('precheckout','prepare_refund') and o.actor<>actor_id then raise exception 'order_not_found';end if;
 if p_action='precheckout' then
  approval:=p_body->>'precheckoutId';if approval is null or length(approval) not between 1 and 256 or p_body->>'currency' is distinct from o.currency or (p_body->>'stars')::int is distinct from o.stars then raise exception 'amount_mismatch';end if;
  if o.expires_at<=stamp or o.state not in('pending','approved') then raise exception 'order_not_payable';end if;
  if not exists(select 1 from public.rewards_monetization_draft where id and config->o.product->>'visibility'='admin_test') then raise exception 'product_not_in_test';end if;
  if o.state='approved' and o.approval_id<>approval then raise exception 'order_not_payable';end if;
  if o.state='pending' then update public.rewards_stars_pilot_orders set state='approved',approval_id=approval,approved_at=stamp where id=o.id returning * into o;end if;
 elsif p_action='receipt' then
  charge:=p_body->>'chargeId';if charge is null or length(charge) not between 1 and 512 or p_body->>'currency' is distinct from o.currency or (p_body->>'stars')::int is distinct from o.stars then raise exception 'invalid_receipt';end if;
  -- A payment approved before the gate closed must still be recorded.
  if o.state in('paid','refunded') then if o.charge_id<>charge then raise exception 'request_conflict';end if;return to_jsonb(o);end if;
  if o.state<>'approved' then raise exception 'order_not_approved';end if;
  update public.rewards_stars_pilot_orders set state='paid',charge_id=charge,paid_at=stamp where id=o.id returning * into o;
 elsif p_action='prepare_refund' then
  if o.state='refunded' then return to_jsonb(o);end if;
  if o.state<>'paid' then raise exception 'order_not_paid';end if;
  if o.refund_requested_at>stamp-interval '1 minute' then raise exception 'refund_pending';end if;
  update public.rewards_stars_pilot_orders set refund_requested_at=stamp where id=o.id returning * into o;
 elsif p_action='refund' then
  charge:=p_body->>'chargeId';if charge is null or charge is distinct from o.charge_id or p_body->>'currency' is distinct from o.currency or (p_body->>'stars')::int is distinct from o.stars then raise exception 'invalid_receipt';end if;
  if o.state='refunded' then return to_jsonb(o);end if;
  if o.state<>'paid' then raise exception 'order_not_paid';end if;
  update public.rewards_stars_pilot_orders set state='refunded',refunded_at=stamp where id=o.id returning * into o;
 else raise exception 'invalid_request';end if;
 return to_jsonb(o);
end $$;
revoke all on function public.rewards_stars_pilot_action(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_stars_pilot_action(text,text,jsonb) to service_role;
notify pgrst,'reload schema';
