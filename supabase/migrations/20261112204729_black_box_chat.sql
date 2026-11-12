create table public.rewards_black_box_chat (
  id bigint generated always as identity primary key,
  box_id uuid not null references public.rewards_black_boxes(id) on delete cascade,
  user_id uuid not null references public.rewards_users(id) on delete cascade,
  author text not null,
  message text not null check (char_length(message) between 1 and 140),
  created_at timestamptz not null default clock_timestamp()
);
create index rewards_black_box_chat_feed on public.rewards_black_box_chat(box_id, created_at, id);
create index rewards_black_box_chat_author on public.rewards_black_box_chat(user_id, created_at desc);
create index rewards_black_box_chat_expiry on public.rewards_black_box_chat(created_at);

alter table public.rewards_black_box_chat enable row level security;
revoke all on public.rewards_black_box_chat from public, anon, authenticated;
grant select, insert on public.rewards_black_box_chat to service_role;

create function public.rewards_black_box_chat_read(p_box uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id::text, 'author', author, 'message', message, 'createdAt', created_at
  ) order by created_at, id), '[]'::jsonb)
  from public.rewards_black_box_chat
  where box_id = p_box and created_at > statement_timestamp() - interval '1 hour';
$$;

create function public.rewards_black_box_chat_send(p_box uuid, p_twitch_user text, p_message text) returns void
language plpgsql security invoker set search_path = '' as $$
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
  where twitch_user_id = p_twitch_user and not banned and not participation_restricted;
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
$$;

revoke all on function public.rewards_black_box_chat_read(uuid),
  public.rewards_black_box_chat_send(uuid, text, text) from public, anon, authenticated;
grant execute on function public.rewards_black_box_chat_read(uuid),
  public.rewards_black_box_chat_send(uuid, text, text) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rewards-black-box-chat-expiry', '* * * * *',
      'delete from public.rewards_black_box_chat where created_at <= now() - interval ''1 hour''');
  end if;
end;
$$;
