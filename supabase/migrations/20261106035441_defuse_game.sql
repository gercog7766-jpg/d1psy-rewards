-- One free attempt per account in a rolling four-hour window, at any difficulty.
create table public.rewards_defuse_games (
 id uuid primary key,
 user_id uuid not null references public.rewards_users(id) on delete cascade,
 difficulty text not null check(difficulty in('rookie','swat','expert')),
 status text not null default 'playing' check(status in('playing','won','lost')),
 started_at timestamptz not null default clock_timestamp(),
 deadline timestamptz not null,
 next_available_at timestamptz not null,
 stage integer not null default 0 check(stage between 0 and 3),
 stage_started_at timestamptz not null default clock_timestamp(),
 ready_at timestamptz not null,
 mistakes integer not null default 0 check(mistakes between 0 and 3),
 puzzles jsonb not null check(jsonb_array_length(puzzles)=3),
 request_ids uuid[] not null default '{}',request_payloads text[] not null default '{}',
 reward_transaction_id uuid unique references public.rewards_coin_transactions(id),
 finished_at timestamptz
);
create index rewards_defuse_user_latest_idx on public.rewards_defuse_games(user_id,started_at desc);
alter table public.rewards_defuse_games enable row level security;
revoke all on public.rewards_defuse_games from public,anon,authenticated;
grant select,insert,update on public.rewards_defuse_games to service_role;

create function public.rewards_defuse_state(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_defuse_games;
begin
 select * into g from public.rewards_defuse_games where user_id=p_user order by started_at desc limit 1 for update;
 if g.id is not null and g.status='playing' and g.deadline<=clock_timestamp() then
  update public.rewards_defuse_games set status='lost',finished_at=clock_timestamp() where id=g.id returning * into g;
 end if;
 return jsonb_build_object('serverNow',clock_timestamp(),'game',case when g.id is null then null else to_jsonb(g) end);
end $$;

create function public.rewards_defuse_start(p_user uuid,p_id uuid,p_difficulty text,p_puzzles jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_defuse_games; duration integer; t timestamptz;
begin
 if p_id is null or p_difficulty not in('rookie','swat','expert') or p_difficulty is null or jsonb_typeof(p_puzzles)<>'array' or jsonb_array_length(p_puzzles)<>3 then raise exception 'invalid_request'; end if;
 if not exists(select 1 from public.rewards_users where id=p_user and not coalesce(banned,false)) then raise exception 'user_unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended('defuse:'||p_user::text,0));
 select * into g from public.rewards_defuse_games where id=p_id;
 if found then
  if g.user_id<>p_user or g.difficulty<>p_difficulty then raise exception 'invalid_request'; end if;
  return public.rewards_defuse_state(p_user);
 end if;
 select * into g from public.rewards_defuse_games where user_id=p_user order by started_at desc limit 1 for update;
 t:=clock_timestamp();
 if g.id is not null and g.next_available_at>t then return public.rewards_defuse_state(p_user); end if;
 update public.rewards_defuse_games set status='lost',finished_at=t where user_id=p_user and status='playing';
 duration:=case p_difficulty when 'rookie' then 90 when 'swat' then 60 else 45 end;
 insert into public.rewards_defuse_games(id,user_id,difficulty,started_at,deadline,next_available_at,stage_started_at,ready_at,puzzles)
 values(p_id,p_user,p_difficulty,t,t+duration*interval '1 second',t+interval '4 hours',t,t+interval '3 seconds',p_puzzles);
 return public.rewards_defuse_state(p_user);
end $$;

create function public.rewards_defuse_answer(p_user uuid,p_game uuid,p_stage integer,p_answer text,p_request uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
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
   reward:=case g.difficulty when 'rookie' then 10 when 'swat' then 20 else 30 end;
   insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user,reward,'adjustment','DEFUSE THE BOMB · '||g.difficulty||' · '||g.id::text) returning id into tx;
   update public.rewards_defuse_games set stage=3,status='won',finished_at=t,reward_transaction_id=tx where id=g.id;
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
revoke all on function public.rewards_defuse_state(uuid),public.rewards_defuse_start(uuid,uuid,text,jsonb),public.rewards_defuse_answer(uuid,uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.rewards_defuse_state(uuid),public.rewards_defuse_start(uuid,uuid,text,jsonb),public.rewards_defuse_answer(uuid,uuid,integer,text,uuid) to service_role;
