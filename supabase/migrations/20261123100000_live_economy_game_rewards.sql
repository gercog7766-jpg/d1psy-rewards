-- Keep existing game awards and completed records. New awards use reduced rates.
alter table public.rewards_wordly_games add column reward_coins int not null default 25;
alter table public.rewards_defuse_games add column reward_coins int;
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
      values (p_user_id, 10, 'adjustment', 'Вордли · победа · ' || p_day::text)
      returning id into g.reward_transaction_id;
    update public.rewards_wordly_games
      set reward_transaction_id = g.reward_transaction_id, reward_coins=10
      where user_id = p_user_id and game_day = p_day returning * into g;
  end if;
  return to_jsonb(g);
end;
$$;

create or replace function public.rewards_defuse_answer(p_user uuid,p_game uuid,p_stage integer,p_answer text,p_request uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_defuse_games; idx integer; t timestamptz; reward integer; tx uuid; content text; next_stage integer;
begin
 if p_request is null or p_stage is null or p_stage not between 0 and 2 or p_answer is null or p_answer !~ '^[0-9]{1,12}$' then raise exception 'invalid_request'; end if;
 if not exists(select 1 from public.rewards_users where id=p_user and not coalesce(banned,false)) then raise exception 'user_unavailable'; end if;
 select * into g from public.rewards_defuse_games where id=p_game and user_id=p_user for update;
 if not found then raise exception 'game_not_found'; end if;
 content:=p_stage::text||':'||p_answer;idx:=array_position(g.request_ids,p_request);
 if idx is not null then
  if g.request_payloads[idx]<>content then raise exception 'invalid_request'; end if;
  return jsonb_build_object('serverNow',clock_timestamp(),'game',to_jsonb(g));
 end if;
 t:=clock_timestamp();
 if g.status<>'playing' then return jsonb_build_object('serverNow',t,'game',to_jsonb(g)); end if;
 if g.deadline<=t then
  update public.rewards_defuse_games set status='lost',finished_at=t where id=g.id returning * into g;
  return jsonb_build_object('serverNow',t,'game',to_jsonb(g));
 end if;
 if p_stage<>g.stage then raise exception 'stale_stage'; end if;
 if t<g.ready_at then raise exception 'memorize_first'; end if;
 update public.rewards_defuse_games set request_ids=array_append(request_ids,p_request),request_payloads=array_append(request_payloads,content) where id=g.id;
 if p_answer=g.puzzles->g.stage->>'answer' then
  next_stage:=g.stage+1;
  if next_stage=3 then
   reward:=case g.difficulty when 'rookie' then 3 when 'swat' then 5 else 10 end;
   insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user,reward,'adjustment','DEFUSE THE BOMB · '||g.difficulty||' · '||g.id::text) returning id into tx;
   update public.rewards_defuse_games set stage=3,status='won',finished_at=t,reward_transaction_id=tx,reward_coins=reward where id=g.id;
  else
   update public.rewards_defuse_games set stage=next_stage,stage_started_at=t,ready_at=t+coalesce((puzzles->next_stage->>'previewMs')::integer,0)*interval '1 millisecond' where id=g.id;
  end if;
 else
  update public.rewards_defuse_games set mistakes=mistakes+1,deadline=deadline-interval '5 seconds',
   status=case when mistakes+1>=3 or deadline-interval '5 seconds'<=t then 'lost' else 'playing' end,
   finished_at=case when mistakes+1>=3 or deadline-interval '5 seconds'<=t then t else null end where id=g.id;
 end if;
 select * into g from public.rewards_defuse_games where id=p_game;
 return jsonb_build_object('serverNow',clock_timestamp(),'game',to_jsonb(g));
end $$;

create or replace function public.rewards_nr_settle_v3(p_user uuid,p_game uuid) returns void language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games;tx uuid;amount integer;begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 select * into g from public.rewards_nr_games where id=p_game and user_id=p_user for update;
 if not found then raise exception 'game_not_found';end if;
 if g.version not in(3,4,5) or g.status='playing' or g.settled_at is not null then return;end if;
 amount:=case when (g.status in('stopped','expired') or g.version in(4,5) and g.status='crashed') then least(g.coins,10) else 0 end;
 if amount>0 then insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user,amount,'adjustment','NIGHT RUN · завершение забега') returning id into tx;end if;
 update public.rewards_nr_games set paid_coins=amount,settlement_transaction_id=tx,settled_at=clock_timestamp() where id=g.id;
end $$;

-- Preserve old game snapshots while changing settings for new games.
do $$declare c record;begin
 for c in select conrelid::regclass as rel,conname from pg_constraint where contype='c' and conrelid in('public.rewards_ms_settings'::regclass,'public.rewards_ms_games'::regclass) and pg_get_constraintdef(oid) ilike '%reward%' loop
 execute format('alter table %s drop constraint %I',c.rel,c.conname);end loop;
end$$;
alter table public.rewards_ms_settings add constraint rewards_ms_settings_live_reward check((difficulty='easy' and reward in(2,5)) or (difficulty='medium' and reward in(5,15)) or (difficulty='hard' and reward in(10,25)));
alter table public.rewards_ms_games add constraint rewards_ms_games_live_reward check(reward in(2,5,10,15,25));
update public.rewards_ms_settings set reward=case difficulty when 'easy' then 2 when 'medium' then 5 else 10 end;
-- Keep weekly settlement and its record triggers, only remove the monetary reward.
create or replace function public.rewards_game_week_prize(p_game text,p_category text,p_rank integer) returns integer language sql immutable security invoker set search_path='' as $$select 0$$;
notify pgrst,'reload schema';
