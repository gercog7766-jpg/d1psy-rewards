-- Additive: no changes to balances, rewards, rounds or existing tables.
create table public.rewards_wordly_games (
  user_id uuid not null references public.rewards_users(id) on delete cascade,
  game_day date not null,
  answer text not null check (answer ~ '^[а-я]{5}$'),
  guesses text[] not null default '{}',
  request_ids uuid[] not null default '{}',
  primary key (user_id, game_day),
  check (cardinality(guesses) <= 6),
  check (cardinality(guesses) = cardinality(request_ids))
);
alter table public.rewards_wordly_games enable row level security;
revoke all on public.rewards_wordly_games from public, anon, authenticated;
grant select, insert, update on public.rewards_wordly_games to service_role;

-- Only the authenticated application server can call this RPC. No client user ID
-- is trusted; the application resolves it from its signed Twitch session.
create function public.rewards_wordly_guess(
  p_user_id uuid, p_day date, p_guess text, p_request_id uuid, p_answer text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  g public.rewards_wordly_games%rowtype;
  existing_index integer;
begin
  if p_day is null or p_day <> (clock_timestamp() at time zone 'Europe/Moscow')::date then
    raise exception 'new_day';
  end if;
  if p_guess is null or p_guess !~ '^[а-я]{5}$' or p_request_id is null then
    raise exception 'invalid_request';
  end if;
  insert into public.rewards_wordly_games(user_id, game_day, answer)
    values (p_user_id, p_day, p_answer) on conflict do nothing;
  select * into strict g from public.rewards_wordly_games
    where user_id = p_user_id and game_day = p_day for update;
  -- A request may have waited on another transaction across midnight.
  if p_day <> (clock_timestamp() at time zone 'Europe/Moscow')::date then
    raise exception 'new_day';
  end if;
  existing_index := array_position(g.request_ids, p_request_id);
  if existing_index is not null then
    if g.guesses[existing_index] <> p_guess then raise exception 'invalid_request'; end if;
    return to_jsonb(g);
  end if;
  if g.answer = any(g.guesses) or cardinality(g.guesses) >= 6 then return to_jsonb(g); end if;
  update public.rewards_wordly_games
    set guesses = array_append(guesses, p_guess), request_ids = array_append(request_ids, p_request_id)
    where user_id = p_user_id and game_day = p_day returning * into g;
  return to_jsonb(g);
end;
$$;
revoke all on function public.rewards_wordly_guess(uuid,date,text,uuid,text) from public, anon, authenticated;
grant execute on function public.rewards_wordly_guess(uuid,date,text,uuid,text) to service_role;
