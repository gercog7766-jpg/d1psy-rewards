-- Let the owner-operated Windows client manage Connect rules with its short-lived scoped key.
-- The key is only accepted for the currently enabled primary streamer and expires after 24 hours.
create or replace function public.rewards_connect_program_config(p_hash text,p_action text,p_body jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor text;
begin
 select s.broadcaster into actor
 from public.rewards_connect_settings s
 join public.rewards_streamers primary_streamer on primary_streamer.twitch_broadcaster_id=s.broadcaster and primary_streamer.is_primary and primary_streamer.enabled
 where s.key_hash=p_hash and s.key_expires>now()
 for update of s;
 if actor is null then raise exception 'invalid_key';end if;
 if p_action not in('state','configure') then raise exception 'invalid_action';end if;
 return public.rewards_connect_admin(actor,p_action,p_body);
end $$;
revoke all on function public.rewards_connect_program_config(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_connect_program_config(text,text,jsonb) to service_role;
