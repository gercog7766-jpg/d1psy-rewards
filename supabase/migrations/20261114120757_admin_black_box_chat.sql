-- A participation restriction must not mute an administrator in the auction chat.
CREATE OR REPLACE FUNCTION public.rewards_black_box_chat_send(p_box uuid, p_twitch_user text, p_message text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  sender record;
begin
  if p_message is null or char_length(btrim(p_message)) not between 1 and 140
      or p_message ~ '[[:cntrl:]]' then
    raise exception 'invalid_message';
  end if;

  select id, coalesce(nullif(twitch_display_name, ''), nullif(twitch_login, ''), 'Игрок') as author
  into sender
  from public.rewards_users
  where twitch_user_id = p_twitch_user and not banned
    and (not participation_restricted or exists (
      select 1 from public.rewards_admins a where a.twitch_user_id = p_twitch_user
    ));
  if not found then raise exception 'participation_restricted'; end if;

  perform pg_advisory_xact_lock(hashtextextended('black_box_chat:' || sender.id::text, 0));
  if exists (
    select 1 from public.rewards_black_box_chat
    where user_id = sender.id and created_at > clock_timestamp() - interval '2 seconds'
  ) then
    raise exception 'chat_rate_limit';
  end if;

  insert into public.rewards_black_box_chat (box_id, user_id, author, message)
  select id, sender.id, sender.author, btrim(p_message)
  from public.rewards_black_boxes
  where id = p_box and closed_at is null and starts_at <= clock_timestamp() and ends_at > clock_timestamp();
  if not found then raise exception 'auction_closed'; end if;
end;
$function$;

grant delete on public.rewards_black_box_chat to service_role;
