-- Only saved player visibility permits player invoices. Existing products stay hidden.
-- Preserve receipt processing, ownership checks, replay handling and price snapshots.
do $migration$
declare
 definition text := pg_get_functiondef('public.rewards_stars_pilot_action(text,text,jsonb)'::regprocedure);
 old_create text := $s$if cfg is null or cfg->>'visibility' is distinct from 'admin_test' then$s$;
 old_approve text := $s$config->o.product->>'visibility'='admin_test'$s$;
 admin_join text := ' join public.rewards_admins a on a.twitch_user_id=u.twitch_user_id';
begin
 if strpos(definition,old_create)=0 or strpos(definition,old_approve)=0 or strpos(definition,admin_join)=0 then
  raise exception 'unexpected_stars_pilot_definition';
 end if;
 definition := replace(definition,admin_join,'');
 definition := replace(definition,old_create,$s$if not coalesce(
  (cfg->>'visibility'='admin_test' and exists(select 1 from public.rewards_admins a where a.twitch_user_id=actor_id))
  or (cfg->>'visibility'='players' and product_key in ('lite','plus')),false) then$s$);
 definition := replace(definition,old_approve,$s$((config->o.product->>'visibility'='admin_test' and exists(select 1 from public.rewards_admins a where a.twitch_user_id=actor_id))
  or (config->o.product->>'visibility'='players' and o.product in ('lite','plus')))$s$);
 execute definition;
end $migration$;

create or replace function public.rewards_stars_gift_tier(p_user uuid) returns text
language sql stable security invoker set search_path='' as $$
 select coalesce((select public.rewards_stars_entitlements(u.twitch_user_id)->>'tier'
 from public.rewards_users u where u.id=p_user and not coalesce(u.banned,false)),'free');
$$;
notify pgrst,'reload schema';
