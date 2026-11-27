-- Welcome coins are a lifetime gift for the highest qualifying paid tier.
-- Administrative pilot invoices and older orders are excluded.
alter table public.rewards_stars_pilot_orders add column welcome_eligible boolean not null default false;
create table public.rewards_stars_welcome_grants(
 user_id uuid primary key references public.rewards_users(id) on delete restrict,
 amount integer not null check(amount in (0,50,100)),
 updated_at timestamptz not null default now()
);
alter table public.rewards_stars_welcome_grants enable row level security;
revoke all on public.rewards_stars_welcome_grants from public,anon,authenticated;
grant select,insert,update on public.rewards_stars_welcome_grants to service_role;

create function public.rewards_stars_welcome_snapshot() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 new.welcome_eligible := new.product in ('lite','plus') and new.state='pending' and
 coalesce((select config->new.product->>'visibility'='players' from public.rewards_monetization_draft where id),false);
 return new;
end $$;
revoke all on function public.rewards_stars_welcome_snapshot() from public,anon,authenticated;
grant execute on function public.rewards_stars_welcome_snapshot() to service_role;
create trigger rewards_stars_welcome_snapshot before insert on public.rewards_stars_pilot_orders
 for each row execute function public.rewards_stars_welcome_snapshot();

create function public.rewards_stars_welcome_reconcile() returns trigger
language plpgsql security invoker set search_path='' as $$
declare recipient uuid; current_amount integer; target_amount integer; delta integer;
begin
 if not new.welcome_eligible or new.state not in ('paid','refunded') or old.state=new.state then return new;end if;
 -- Serialize with other wallet operations for this user. Never reject a refund
 -- because coins have been spent; a compensating debit remains in the ledger.
 select id into recipient from public.rewards_users where twitch_user_id=new.actor for update;
 if recipient is null then raise exception 'welcome_user_missing';end if;
 select coalesce(max(case product when 'plus' then 100 when 'lite' then 50 else 0 end),0)
 into target_amount from public.rewards_stars_pilot_orders
 where actor=new.actor and welcome_eligible and state='paid';
 select amount into current_amount from public.rewards_stars_welcome_grants where user_id=recipient;
 delta:=target_amount-coalesce(current_amount,0);
 if delta<>0 then
  insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
  values(recipient,delta,'adjustment',case when delta>0 then 'DROPSO Membership · приветственный подарок' else 'DROPSO Membership · возврат подарка' end||' · '||new.id);
 end if;
 insert into public.rewards_stars_welcome_grants(user_id,amount) values(recipient,target_amount)
 on conflict(user_id) do update set amount=excluded.amount,updated_at=now();
 return new;
end $$;
revoke all on function public.rewards_stars_welcome_reconcile() from public,anon,authenticated;
grant execute on function public.rewards_stars_welcome_reconcile() to service_role;
create trigger rewards_stars_welcome_reconcile after update of state on public.rewards_stars_pilot_orders
 for each row execute function public.rewards_stars_welcome_reconcile();
notify pgrst,'reload schema';
