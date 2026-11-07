-- Registered Twitch users may apply; approval and wallet funding remain owner-only.
alter table public.rewards_streamer_live_profiles drop constraint rewards_streamer_live_profiles_broadcaster_id_check;
alter table public.rewards_streamer_live_profiles add constraint rewards_streamer_live_profiles_broadcaster_id_check check(broadcaster_id ~ '^[0-9]{1,30}$');
do $$
declare definition text;old_guard text:=$old$if p_actor not in('511100980','39780903') then raise exception 'pilot_invite_only';end if;$old$;
old_name text:=$old$length(trim(coalesce(p_body->>'name','')))<1 or length(p_body->>'name')>80$old$;
begin
 select pg_get_functiondef('public.rewards_streamer_live_api(text,text,jsonb)'::regprocedure) into definition;
 if position(old_guard in definition)=0 or position(old_name in definition)=0 then raise exception 'unexpected_streamer_application_definition';end if;
 definition:=replace(definition,old_guard,$new$if p_actor !~ '^[0-9]{1,30}$' then raise exception 'invalid_application';end if;$new$);
 -- The existing name field now stores the applicant's Telegram username. Existing profiles stay intact.
 definition:=replace(definition,old_name,$new$coalesce(p_body->>'name','') !~ '^@?[A-Za-z][A-Za-z0-9_]{4,31}$'$new$);
 execute definition;
end $$;
