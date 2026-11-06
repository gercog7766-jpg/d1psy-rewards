-- Server-authoritative classic 10x10 Minesweeper. Three attempts share one rolling cycle.
create table public.rewards_ms_settings(
 difficulty text primary key check(difficulty in('easy','medium','hard')),
 mines integer not null check(mines between 1 and 80),reward integer not null,
 version integer not null default 0 check(version>=0),
 check((difficulty='easy' and reward=5) or (difficulty='medium' and reward=15) or (difficulty='hard' and reward=25))
);
insert into public.rewards_ms_settings(difficulty,mines,reward) values('easy',10,5),('medium',15,15),('hard',20,25);
create table public.rewards_ms_cycles(
 user_id uuid primary key references public.rewards_users(id) on delete cascade,
 cycle_id uuid not null default gen_random_uuid(),attempts_used integer not null default 0 check(attempts_used between 0 and 3),
 cooldown_until timestamptz
);
create table public.rewards_ms_games(
 id uuid primary key,user_id uuid not null references public.rewards_users(id) on delete cascade,cycle_id uuid not null,
 attempt integer not null check(attempt between 1 and 3),difficulty text not null references public.rewards_ms_settings(difficulty),
 mine_count integer not null check(mine_count between 1 and 80),reward integer not null check(reward in(5,15,25)),
 status text not null default 'playing' check(status in('playing','won','lost')),
 mines integer[] not null default '{}',opened integer[] not null default '{}',flags integer[] not null default '{}',
 version integer not null default 0,last_request uuid,last_payload text,
 started_at timestamptz not null default clock_timestamp(),finished_at timestamptz,
 reward_transaction_id uuid unique references public.rewards_coin_transactions(id),unique(user_id,cycle_id,attempt)
);
create unique index rewards_ms_one_active on public.rewards_ms_games(user_id) where status='playing';
create index rewards_ms_games_difficulty on public.rewards_ms_games(difficulty);
alter table public.rewards_ms_settings enable row level security;
alter table public.rewards_ms_cycles enable row level security;
alter table public.rewards_ms_games enable row level security;
revoke all on public.rewards_ms_settings,public.rewards_ms_cycles,public.rewards_ms_games from public,anon,authenticated;
grant select,update on public.rewards_ms_settings to service_role;
grant select,insert,update on public.rewards_ms_cycles,public.rewards_ms_games to service_role;

create function public.rewards_ms_neighbors(p_cell integer) returns integer[] language sql immutable security invoker set search_path='' as $$
 select coalesce(array_agg(i order by i),'{}'::integer[]) from generate_series(0,99) i
 where i<>p_cell and abs(i/10-p_cell/10)<=1 and abs(i%10-p_cell%10)<=1;
$$;
create function public.rewards_ms_public(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.rewards_ms_cycles;g public.rewards_ms_games;cells jsonb;levels jsonb;
begin
 select * into c from public.rewards_ms_cycles where user_id=p_user;
 select * into g from public.rewards_ms_games where user_id=p_user and cycle_id=c.cycle_id order by attempt desc limit 1;
 select jsonb_agg(jsonb_build_object('difficulty',difficulty,'mines',mines,'reward',reward) order by reward) into levels from public.rewards_ms_settings;
 if g.id is not null then
  select jsonb_agg(jsonb_build_object('index',i,'open',i=any(g.opened),'flag',i=any(g.flags),
   'mine',g.status<>'playing' and i=any(g.mines),
   'value',case when i=any(g.opened) then case when i=any(g.mines) then -1 else (select count(*) from unnest(public.rewards_ms_neighbors(i)) n where n=any(g.mines)) end end) order by i) into cells from generate_series(0,99) i;
 end if;
 return jsonb_build_object('serverNow',clock_timestamp(),'attemptsLeft',case when c.cooldown_until is not null then 0 else 3-coalesce(c.attempts_used,0) end,
  'cooldownUntil',c.cooldown_until,'levels',levels,'game',case when g.id is null then null else jsonb_build_object(
  'id',g.id,'attempt',g.attempt,'difficulty',g.difficulty,'mineCount',g.mine_count,'reward',g.reward,'status',g.status,'version',g.version,
  'startedAt',g.started_at,'finishedAt',g.finished_at,'cells',cells) end);
end $$;
create function public.rewards_ms_prepare(p_user uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 -- Same wallet lock as purchases and other games; also serializes tabs and attempts.
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 insert into public.rewards_ms_cycles(user_id) values(p_user) on conflict do nothing;
 update public.rewards_ms_cycles set cycle_id=gen_random_uuid(),attempts_used=0,cooldown_until=null where user_id=p_user and cooldown_until<=clock_timestamp();
end $$;
create function public.rewards_ms_state(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
begin perform public.rewards_ms_prepare(p_user);return public.rewards_ms_public(p_user);end $$;
create function public.rewards_ms_start(p_user uuid,p_id uuid,p_difficulty text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.rewards_ms_cycles;g public.rewards_ms_games;s public.rewards_ms_settings;
begin
 if p_id is null or p_difficulty is null or p_difficulty not in('easy','medium','hard') then raise exception 'invalid_request';end if;
 perform public.rewards_ms_prepare(p_user);
 select * into g from public.rewards_ms_games where id=p_id;
 if found then
  if g.user_id<>p_user or g.difficulty<>p_difficulty then raise exception 'request_conflict';end if;
  return public.rewards_ms_public(p_user);
 end if;
 select * into c from public.rewards_ms_cycles where user_id=p_user;
 if c.cooldown_until is not null then return public.rewards_ms_public(p_user);end if;
 if exists(select 1 from public.rewards_ms_games where user_id=p_user and cycle_id=c.cycle_id and status='playing') then return public.rewards_ms_public(p_user);end if;
 if c.attempts_used>=3 then raise exception 'invalid_request';end if;
 select * into s from public.rewards_ms_settings where difficulty=p_difficulty;
 insert into public.rewards_ms_games(id,user_id,cycle_id,attempt,difficulty,mine_count,reward) values(p_id,p_user,c.cycle_id,c.attempts_used+1,p_difficulty,s.mines,s.reward);
 update public.rewards_ms_cycles set attempts_used=attempts_used+1 where user_id=p_user;
 return public.rewards_ms_public(p_user);
end $$;
create function public.rewards_ms_move(p_user uuid,p_game uuid,p_version integer,p_action text,p_cell integer,p_request uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_ms_games;c public.rewards_ms_cycles;queue integer[];neighbors integer[];cell integer;adj integer;flagged integer;payload text;stamp timestamptz;tx uuid;
begin
 if p_request is null or p_game is null or p_version is null or p_version<0 or p_action is null or p_action not in('open','flag','chord','giveup') or p_cell is null or p_cell not between 0 and 99 then raise exception 'invalid_request';end if;
 perform public.rewards_ms_prepare(p_user);
 select * into c from public.rewards_ms_cycles where user_id=p_user;
 select * into g from public.rewards_ms_games where id=p_game and user_id=p_user and cycle_id=c.cycle_id for update;
 if not found then raise exception 'game_not_found';end if;
 payload:=p_action||':'||p_cell||':'||p_version;
 if g.last_request=p_request then
  if g.last_payload<>payload then raise exception 'request_conflict';end if;
  return public.rewards_ms_public(p_user);
 end if;
 if g.status<>'playing' then return public.rewards_ms_public(p_user);end if;
 if g.version<>p_version then raise exception 'stale_move';end if;
 queue:='{}';
 if p_action='giveup' then g.status:='lost';
 elsif p_action='flag' then
  if not p_cell=any(g.opened) then
   if p_cell=any(g.flags) then g.flags:=array_remove(g.flags,p_cell);
   elsif cardinality(g.flags)<g.mine_count then g.flags:=array_append(g.flags,p_cell);end if;
  end if;
 elsif p_action='open' and not p_cell=any(g.opened) and not p_cell=any(g.flags) then
  if cardinality(g.mines)=0 then
   -- Excluding the first cell and its neighbors guarantees a safe zero opening.
   neighbors:=array_append(public.rewards_ms_neighbors(p_cell),p_cell);
   g.mines:=array(select i from generate_series(0,99) i where not i=any(neighbors) order by random() limit g.mine_count);
  end if;
  queue:=array[p_cell];
 elsif p_action='chord' and p_cell=any(g.opened) then
  neighbors:=public.rewards_ms_neighbors(p_cell);
  select count(*) into adj from unnest(neighbors) n where n=any(g.mines);
  select count(*) into flagged from unnest(neighbors) n where n=any(g.flags);
  if adj=flagged then queue:=neighbors;end if;
 end if;
 while cardinality(queue)>0 loop
  cell:=queue[1];queue:=queue[2:cardinality(queue)];
  if cell=any(g.opened) or cell=any(g.flags) then continue;end if;
  g.opened:=array_append(g.opened,cell);
  if cell=any(g.mines) then g.status:='lost';exit;end if;
  neighbors:=public.rewards_ms_neighbors(cell);
  select count(*) into adj from unnest(neighbors) n where n=any(g.mines);
  if adj=0 then queue:=queue||neighbors;end if;
 end loop;
 stamp:=clock_timestamp();
 if g.status='playing' and cardinality(g.mines)>0 and cardinality(g.opened)=100-g.mine_count then
  g.status:='won';g.flags:=g.mines;
  insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user,g.reward,'adjustment','Сапёр · победа · '||g.id) returning id into tx;
  g.reward_transaction_id:=tx;
 end if;
 if g.status<>'playing' then
  g.finished_at:=stamp;
  if g.status='won' or g.attempt=3 then update public.rewards_ms_cycles set cooldown_until=stamp+interval '12 hours' where user_id=p_user;end if;
 end if;
 update public.rewards_ms_games set mines=g.mines,opened=g.opened,flags=g.flags,status=g.status,version=version+1,last_request=p_request,last_payload=payload,finished_at=g.finished_at,reward_transaction_id=g.reward_transaction_id where id=g.id;
 return public.rewards_ms_public(p_user);
end $$;
create function public.rewards_ms_configure(p_difficulty text,p_mines integer,p_version integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.rewards_ms_settings;
begin
 if p_mines is null or p_mines not between 1 and 80 or p_version is null or p_version<0 then raise exception 'invalid_request';end if;
 update public.rewards_ms_settings set mines=p_mines,version=version+1 where difficulty=p_difficulty and version=p_version returning * into s;
 if not found then raise exception 'settings_changed';end if;
 return to_jsonb(s);
end $$;
revoke all on function public.rewards_ms_neighbors(integer),public.rewards_ms_public(uuid),public.rewards_ms_prepare(uuid),public.rewards_ms_state(uuid),public.rewards_ms_start(uuid,uuid,text),public.rewards_ms_move(uuid,uuid,integer,text,integer,uuid),public.rewards_ms_configure(text,integer,integer) from public,anon,authenticated;
grant execute on function public.rewards_ms_neighbors(integer),public.rewards_ms_public(uuid),public.rewards_ms_prepare(uuid),public.rewards_ms_state(uuid),public.rewards_ms_start(uuid,uuid,text),public.rewards_ms_move(uuid,uuid,integer,text,integer,uuid),public.rewards_ms_configure(text,integer,integer) to service_role;
