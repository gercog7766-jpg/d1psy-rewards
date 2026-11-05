-- Game completion and the coin award commit together under the existing row lock.
-- Earlier completed games are not modified or awarded retroactively.
alter table public.rewards_wordly_games
  add column reward_transaction_id uuid unique references public.rewards_coin_transactions(id);

create or replace function public.rewards_wordly_guess(
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
  if p_guess = g.answer then
    insert into public.rewards_coin_transactions(user_id, amount, transaction_type, note)
      values (p_user_id, 25, 'adjustment', 'Вордли · победа · ' || p_day::text)
      returning id into g.reward_transaction_id;
    update public.rewards_wordly_games
      set reward_transaction_id = g.reward_transaction_id
      where user_id = p_user_id and game_day = p_day returning * into g;
  end if;
  return to_jsonb(g);
end;
$$;
revoke all on function public.rewards_wordly_guess(uuid,date,text,uuid,text) from public, anon, authenticated;
grant execute on function public.rewards_wordly_guess(uuid,date,text,uuid,text) to service_role;
