-- PROPOSAL ONLY. Do NOT apply to production.
-- Atomic, streamer-scoped chat accounting. Requires schema review before use.
-- The unique event_id constraint on rewards_event_dedup is mandatory.
create or replace function public.rewards_streamer_record_chat_atomic(
 p_streamer_id uuid,
 p_broadcaster_id text,
 p_message_id text,
 p_twitch_user_id text,
 p_occurred_at timestamptz
) returns boolean language plpgsql security invoker set search_path = ''
as $$
declare
 v_round uuid;
 v_broadcaster text;
begin
 if p_message_id is null or length(trim(p_message_id)) = 0
    or length(p_message_id) > 256 then raise exception 'invalid_message_id'; end if;
 if p_twitch_user_id is null or length(trim(p_twitch_user_id)) = 0
    then raise exception 'invalid_chatter_id'; end if;
 select twitch_broadcaster_id into v_broadcaster
 from public.rewards_streamers where id=p_streamer_id and enabled for update;
 if not found or v_broadcaster is distinct from p_broadcaster_id
    then raise exception 'streamer_broadcaster_mismatch'; end if;
 -- Dedup and all downstream changes share the same PostgreSQL transaction.
 insert into public.rewards_event_dedup(event_id,event_type)
 values (p_broadcaster_id || ':' || p_message_id,'channel.chat.message')
 on conflict (event_id) do nothing;
 if not found then return false; end if;
 select id into v_round from public.rewards_rounds
 where streamer_id=p_streamer_id and status='active' for update;
 insert into public.rewards_chat_events
 (twitch_event_id,streamer_id,round_id,twitch_user_id,occurred_at)
 values (p_message_id,p_streamer_id,v_round,p_twitch_user_id,p_occurred_at);
 if v_round is not null then
   perform public.rewards_record_chat_message(v_round,p_twitch_user_id);
 end if;
 return true;
end;
$$;
-- No grants here: review existing privileges and service-role policy first.
