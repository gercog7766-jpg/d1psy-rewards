-- Preserve redemptions and rewards: deletion only hides completed campaigns.
alter table public.rewards_promo_codes add column archived_at timestamptz;
-- Owner and partner namespaces are disjoint, including direct database writes.
alter table public.rewards_promo_codes add constraint owner_promo_namespace check (upper(trim(code)) not like 'STR-%');
update public.rewards_promo_codes set active=false where active and (activation_count>=max_activations or expires_at<=now());
drop index public.rewards_promo_codes_code_ci;
create unique index rewards_promo_codes_code_ci on public.rewards_promo_codes(lower(code)) where active;
create function public.rewards_prepare_owner_promo() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 new.code:=upper(trim(new.code));
 if tg_op='INSERT' then perform pg_advisory_xact_lock(hashtextextended('owner-promo:'||new.code,0));end if;
 if tg_op='UPDATE' and new.code is distinct from old.code then raise exception 'promo_code_immutable';end if;
 if new.archived_at is not null then
  if new.active and new.activation_count<new.max_activations and (new.expires_at is null or new.expires_at>now()) then raise exception 'promo_still_active';end if;
  new.active:=false;
 end if;
 if tg_op='INSERT' and new.active then
  update public.rewards_promo_codes set active=false where lower(code)=lower(new.code) and active and (activation_count>=max_activations or expires_at<=now());
 end if;
 return new;
end$$;
revoke all on function public.rewards_prepare_owner_promo() from public,anon,authenticated;
grant execute on function public.rewards_prepare_owner_promo() to service_role;
create trigger rewards_prepare_owner_promo before insert or update on public.rewards_promo_codes for each row execute function public.rewards_prepare_owner_promo();
