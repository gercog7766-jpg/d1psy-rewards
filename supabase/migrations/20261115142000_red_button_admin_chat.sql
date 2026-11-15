create or replace function public.rewards_live_chat_feed(p_actor text,p_room uuid,p_message text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare sender public.rewards_users%rowtype; cutoff timestamptz:=statement_timestamp()-interval '2 hours';
begin
 select * into sender from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false);
 if not found then raise exception 'chat_unavailable';end if;
 if p_room is not null and not exists(select 1 from public.rewards_ttt_rooms
   where id=p_room and sender.id in(host_id,guest_id))
   and not exists(select 1 from public.rewards_checkers_rooms where id=p_room and sender.id in(host_id,guest_id))
   and not exists(select 1 from public.rewards_red_button_members where round_id=p_room and user_id=sender.id)
   and not exists(
     select 1 from public.rewards_red_button_rounds r
     join public.rewards_admins a on a.twitch_user_id=p_actor
     where r.id=p_room and r.closed_at is null and r.ends_at>clock_timestamp()
   ) then raise exception 'chat_unavailable';end if;
 if p_message is not null then
  if char_length(btrim(p_message)) not between 1 and 140 or p_message~'[[:cntrl:]]'
    then raise exception 'invalid_message';end if;
  perform pg_advisory_xact_lock(hashtextextended('live-chat-sender:'||sender.id,0));
  if exists(select 1 from public.rewards_live_chat where sender_id=sender.id
    and created_at>clock_timestamp()-interval '2 seconds') then raise exception 'chat_rate_limit';end if;
  perform pg_advisory_xact_lock(hashtextextended('live-chat-room:'||coalesce(p_room::text,'public'),0));
  insert into public.rewards_live_chat(room_id,sender_id,nick,message)
    values(p_room,sender.id,coalesce(nullif(sender.twitch_display_name,''),sender.twitch_login,'Игрок'),btrim(p_message));
  delete from public.rewards_live_chat where id in(select id from public.rewards_live_chat
    where room_id is not distinct from p_room order by id desc offset 100);
 end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',m.id::text,'nick',m.nick,'message',m.message,'at',m.created_at) order by m.id),'[]'::jsonb)
 from (select id,nick,message,created_at from public.rewards_live_chat
   where room_id is not distinct from p_room and created_at>cutoff order by id desc limit 100) m);
end $$;
