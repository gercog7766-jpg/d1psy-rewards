-- Fixed rolling deadlines: easy 3:00, medium 4:00, hard 5:30.
create function public.rewards_ms_time_seconds(p_difficulty text) returns integer language sql immutable security invoker set search_path='' as $$
 select case p_difficulty when 'easy' then 180 when 'medium' then 240 when 'hard' then 330 end;
$$;
alter table public.rewards_ms_games add column deadline_at timestamptz,add column timed_out boolean not null default false;
-- Give already-running games a full duration at rollout; completed games remain unchanged.
update public.rewards_ms_games set deadline_at=(case when status='playing' then clock_timestamp() else started_at end)+public.rewards_ms_time_seconds(difficulty)*interval '1 second';
alter table public.rewards_ms_games alter column deadline_at set not null;
create function public.rewards_ms_deadline() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.deadline_at:=new.started_at+public.rewards_ms_time_seconds(new.difficulty)*interval '1 second';return new;end $$;
create trigger rewards_ms_deadline before insert on public.rewards_ms_games for each row execute function public.rewards_ms_deadline();
create or replace function public.rewards_ms_prepare(p_user uuid) returns void language plpgsql security invoker set search_path='' as $$
declare g public.rewards_ms_games;
begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 insert into public.rewards_ms_cycles(user_id) values(p_user) on conflict do nothing;
 select * into g from public.rewards_ms_games where user_id=p_user and status='playing' for update;
 if found and g.deadline_at<=clock_timestamp() then
  update public.rewards_ms_games set status='lost',timed_out=true,finished_at=g.deadline_at,version=version+1 where id=g.id;
  if g.attempt=3 then update public.rewards_ms_cycles set cooldown_until=g.deadline_at+interval '12 hours' where user_id=p_user and cycle_id=g.cycle_id;end if;
 end if;
 -- A late return does not extend either the game or the cooldown.
 update public.rewards_ms_cycles set cycle_id=gen_random_uuid(),attempts_used=0,cooldown_until=null where user_id=p_user and cooldown_until<=clock_timestamp();
end $$;
revoke all on function public.rewards_ms_time_seconds(text),public.rewards_ms_deadline() from public,anon,authenticated;
grant execute on function public.rewards_ms_time_seconds(text),public.rewards_ms_deadline() to service_role;

create or replace function public.rewards_ms_public(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.rewards_ms_cycles;g public.rewards_ms_games;cells jsonb;levels jsonb;
begin
 select * into c from public.rewards_ms_cycles where user_id=p_user;
 select * into g from public.rewards_ms_games where user_id=p_user and cycle_id=c.cycle_id order by attempt desc limit 1;
 select jsonb_agg(jsonb_build_object('difficulty',difficulty,'mines',mines,'reward',reward,'timeLimitSeconds',public.rewards_ms_time_seconds(difficulty)) order by reward) into levels from public.rewards_ms_settings;
 if g.id is not null then
  select jsonb_agg(jsonb_build_object('index',i,'open',i=any(g.opened),'flag',i=any(g.flags),
   'mine',g.status<>'playing' and i=any(g.mines),
   'value',case when i=any(g.opened) then case when i=any(g.mines) then -1 else (select count(*) from unnest(public.rewards_ms_neighbors(i)) n where n=any(g.mines)) end end) order by i) into cells from generate_series(0,99) i;
 end if;
 return jsonb_build_object('serverNow',clock_timestamp(),'attemptsLeft',case when c.cooldown_until is not null then 0 else 3-coalesce(c.attempts_used,0) end,
  'cooldownUntil',c.cooldown_until,'levels',levels,'game',case when g.id is null then null else jsonb_build_object(
  'id',g.id,'attempt',g.attempt,'difficulty',g.difficulty,'mineCount',g.mine_count,'reward',g.reward,'status',g.status,'version',g.version,
  'startedAt',g.started_at,'deadlineAt',g.deadline_at,'timedOut',g.timed_out,'finishedAt',g.finished_at,'cells',cells) end);
end $$;

create or replace function public.rewards_ms_move(p_user uuid,p_game uuid,p_version integer,p_action text,p_cell integer,p_request uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
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
 -- Check again after flood/chord processing, before any reward is issued.
 if stamp>=g.deadline_at then g.status:='lost';g.timed_out:=true;stamp:=g.deadline_at;end if;
 if g.status='playing' and cardinality(g.mines)>0 and cardinality(g.opened)=100-g.mine_count then
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
