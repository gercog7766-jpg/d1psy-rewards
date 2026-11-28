-- A linked administrator can request a refund for a specific order.
-- All other payment actions remain bound to the purchaser's Telegram ID.
do $migration$
declare definition text:=pg_get_functiondef('public.rewards_stars_pilot_action(text,text,jsonb)'::regprocedure);
 old_lookup text:=$s$where id=(p_body->>'orderId')::uuid and telegram_id=p_telegram_id for update$s$;
 old_actor text:=$s$if p_action in('precheckout','prepare_refund') and o.actor<>actor_id then$s$;
begin
 if strpos(definition,old_lookup)=0 or strpos(definition,old_actor)=0 or
 strpos(definition,$s$p_action='prepare_refund' and not exists(select 1 from public.rewards_admins$s$)=0 then
  raise exception 'unexpected_stars_refund_definition';
 end if;
 definition:=replace(definition,old_lookup,$s$where id=(p_body->>'orderId')::uuid and (telegram_id=p_telegram_id or p_action='prepare_refund') for update$s$);
 definition:=replace(definition,old_actor,$s$if p_action='precheckout' and o.actor<>actor_id then$s$);
 execute definition;
end $migration$;
notify pgrst,'reload schema';
