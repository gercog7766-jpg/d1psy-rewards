-- Qualify the ledger columns; amount is also a PL/pgSQL local variable.
-- Replace only the known admin projection, preserving all other function logic/ACLs.
do $$
declare definition text; old_query text := 'select broadcaster_id,amount,kind,actor,created_at from public.rewards_pilot_ledger order by created_at desc limit 100';
new_query text := 'select l.broadcaster_id,l.amount,l.kind,l.actor,l.created_at from public.rewards_pilot_ledger l order by l.created_at desc,l.id desc limit 100';
begin
 select pg_get_functiondef('public.rewards_pilot_api(text,text,jsonb)'::regprocedure) into definition;
 if position(old_query in definition)=0 then
  if position(new_query in definition)>0 then return;end if;
  raise exception 'unexpected_pilot_api_definition';
 end if;
 execute replace(definition,old_query,new_query);
end $$;
