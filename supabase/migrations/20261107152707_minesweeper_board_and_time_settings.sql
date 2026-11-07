-- Configurable dimensions and deadlines are snapshotted into each new game.
alter table public.rewards_ms_settings add column width integer not null default 10 check(width between 5 and 25),add column height integer not null default 10 check(height between 5 and 25),add column time_seconds integer not null default 180 check(time_seconds between 1 and 3600);
update public.rewards_ms_settings set time_seconds=case difficulty when 'easy' then 180 when 'medium' then 240 else 330 end;
alter table public.rewards_ms_settings drop constraint rewards_ms_settings_mines_check;
alter table public.rewards_ms_settings add constraint rewards_ms_settings_mines_check check(mines between 1 and width*height-9);
alter table public.rewards_ms_games add column width integer not null default 10 check(width between 5 and 25),add column height integer not null default 10 check(height between 5 and 25),add column time_seconds integer not null default 180 check(time_seconds between 1 and 3600);
update public.rewards_ms_games set time_seconds=public.rewards_ms_time_seconds(difficulty);
alter table public.rewards_ms_games drop constraint rewards_ms_games_mine_count_check;
alter table public.rewards_ms_games add constraint rewards_ms_games_mine_count_check check(mine_count between 1 and width*height-9);
create function public.rewards_ms_neighbors(p_cell integer,p_width integer,p_height integer) returns integer[] language sql immutable security invoker set search_path='' as $$
 select coalesce(array_agg(y*p_width+x order by y*p_width+x),'{}'::integer[])
 from generate_series(greatest(0,p_cell/p_width-1),least(p_height-1,p_cell/p_width+1)) y
 cross join generate_series(greatest(0,p_cell%p_width-1),least(p_width-1,p_cell%p_width+1)) x
 where y*p_width+x<>p_cell;
$$;
create or replace function public.rewards_ms_deadline() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.deadline_at:=new.started_at+new.time_seconds*interval '1 second';return new;end $$;
create or replace function public.rewards_ms_start(p_user uuid,p_id uuid,p_difficulty text) returns jsonb language plpgsql security invoker set search_path='' as $$
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
 insert into public.rewards_ms_games(id,user_id,cycle_id,attempt,difficulty,mine_count,reward,width,height,time_seconds) values(p_id,p_user,c.cycle_id,c.attempts_used+1,p_difficulty,s.mines,s.reward,s.width,s.height,s.time_seconds);
 update public.rewards_ms_cycles set attempts_used=attempts_used+1 where user_id=p_user;
 return public.rewards_ms_public(p_user);
end $$;
create or replace function public.rewards_ms_public(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.rewards_ms_cycles;g public.rewards_ms_games;cells jsonb;levels jsonb;
begin
 select * into c from public.rewards_ms_cycles where user_id=p_user;
 select * into g from public.rewards_ms_games where user_id=p_user and cycle_id=c.cycle_id order by attempt desc limit 1;
 select jsonb_agg(jsonb_build_object('difficulty',difficulty,'mines',mines,'reward',reward,'timeLimitSeconds',time_seconds,'width',width,'height',height) order by reward) into levels from public.rewards_ms_settings;
 if g.id is not null then
  select jsonb_agg(jsonb_build_object('index',i,'open',i=any(g.opened),'flag',i=any(g.flags),
   'mine',g.status<>'playing' and i=any(g.mines),
   'value',case when i=any(g.opened) then case when i=any(g.mines) then -1 else (select count(*) from unnest(public.rewards_ms_neighbors(i,g.width,g.height)) n where n=any(g.mines)) end end) order by i) into cells from generate_series(0,g.width*g.height-1) i;
 end if;
 return jsonb_build_object('serverNow',clock_timestamp(),'attemptsLeft',case when c.cooldown_until is not null then 0 else 3-coalesce(c.attempts_used,0) end,
  'cooldownUntil',c.cooldown_until,'levels',levels,'game',case when g.id is null then null else jsonb_build_object(
  'id',g.id,'attempt',g.attempt,'difficulty',g.difficulty,'mineCount',g.mine_count,'reward',g.reward,'status',g.status,'version',g.version,
  'width',g.width,'height',g.height,'timeLimitSeconds',g.time_seconds,'startedAt',g.started_at,'deadlineAt',g.deadline_at,'timedOut',g.timed_out,'finishedAt',g.finished_at,'cells',cells) end);
end $$;
create or replace function public.rewards_ms_move(p_user uuid,p_game uuid,p_version integer,p_action text,p_cell integer,p_request uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_ms_games;c public.rewards_ms_cycles;queue integer[];neighbors integer[];cell integer;adj integer;flagged integer;payload text;stamp timestamptz;tx uuid;
begin
 if p_request is null or p_game is null or p_version is null or p_version<0 or p_action is null or p_action not in('open','flag','chord','giveup') or p_cell is null or p_cell not between 0 and 624 then raise exception 'invalid_request';end if;
 perform public.rewards_ms_prepare(p_user);
 select * into c from public.rewards_ms_cycles where user_id=p_user;
 select * into g from public.rewards_ms_games where id=p_game and user_id=p_user and cycle_id=c.cycle_id for update;
 if not found then raise exception 'game_not_found';end if;
 if p_cell>=g.width*g.height then raise exception 'invalid_request';end if;
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
   neighbors:=array_append(public.rewards_ms_neighbors(p_cell,g.width,g.height),p_cell);
   g.mines:=array(select i from generate_series(0,g.width*g.height-1) i where not i=any(neighbors) order by random() limit g.mine_count);
  end if;
  queue:=array[p_cell];
 elsif p_action='chord' and p_cell=any(g.opened) then
  neighbors:=public.rewards_ms_neighbors(p_cell,g.width,g.height);
  select count(*) into adj from unnest(neighbors) n where n=any(g.mines);
  select count(*) into flagged from unnest(neighbors) n where n=any(g.flags);
  if adj=flagged then queue:=neighbors;end if;
 end if;
 while cardinality(queue)>0 loop
  cell:=queue[1];queue:=queue[2:cardinality(queue)];
  if cell=any(g.opened) or cell=any(g.flags) then continue;end if;
  g.opened:=array_append(g.opened,cell);
  if cell=any(g.mines) then g.status:='lost';exit;end if;
  neighbors:=public.rewards_ms_neighbors(cell,g.width,g.height);
  select count(*) into adj from unnest(neighbors) n where n=any(g.mines);
  if adj=0 then queue:=queue||neighbors;end if;
 end loop;
 stamp:=clock_timestamp();
 -- Check again after flood/chord processing, before any reward is issued.
 if stamp>=g.deadline_at then g.status:='lost';g.timed_out:=true;stamp:=g.deadline_at;end if;
 if g.status='playing' and cardinality(g.mines)>0 and cardinality(g.opened)=g.width*g.height-g.mine_count then
  g.status:='won';g.flags:=g.mines;
  insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user,g.reward,'adjustment','Сапёр · победа · '||g.id) returning id into tx;
  g.reward_transaction_id:=tx;
 end if;
 if g.status<>'playing' then
  g.finished_at:=stamp;
  if g.status='won' or g.attempt=3 then update public.rewards_ms_cycles set cooldown_until=stamp+interval '12 hours' where user_id=p_user;end if;
 end if;
 update public.rewards_ms_games set mines=g.mines,opened=g.opened,flags=g.flags,status=g.status,version=version+1,last_request=p_request,last_payload=payload,finished_at=g.finished_at,reward_transaction_id=g.reward_transaction_id,timed_out=g.timed_out where id=g.id;
 return public.rewards_ms_public(p_user);
end $$;

create function public.rewards_ms_configure(p_difficulty text,p_mines integer,p_version integer,p_width integer,p_height integer,p_seconds integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.rewards_ms_settings;
begin
 if p_width is null or p_width not between 5 and 25 or p_height is null or p_height not between 5 and 25 or p_seconds is null or p_seconds not between 1 and 3600 or p_mines is null or p_mines not between 1 and p_width*p_height-9 or p_version is null or p_version<0 then raise exception 'invalid_request';end if;
 update public.rewards_ms_settings set mines=p_mines,width=p_width,height=p_height,time_seconds=p_seconds,version=version+1 where difficulty=p_difficulty and version=p_version returning * into s;
 if not found then raise exception 'settings_changed';end if;
 return to_jsonb(s);
end $$;
-- Old admin clients keep the current dimensions/time and remain version-checked.
create or replace function public.rewards_ms_configure(p_difficulty text,p_mines integer,p_version integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.rewards_ms_settings;
begin
 select * into s from public.rewards_ms_settings where difficulty=p_difficulty;
 return public.rewards_ms_configure(p_difficulty,p_mines,p_version,s.width,s.height,s.time_seconds);
end $$;
revoke all on function public.rewards_ms_neighbors(integer,integer,integer),public.rewards_ms_configure(text,integer,integer,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.rewards_ms_neighbors(integer,integer,integer),public.rewards_ms_configure(text,integer,integer,integer,integer,integer) to service_role;
