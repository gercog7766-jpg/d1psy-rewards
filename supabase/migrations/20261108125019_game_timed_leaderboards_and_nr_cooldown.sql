create or replace function public.rewards_nr_state(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games%rowtype;
begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 select * into g from public.rewards_nr_games where user_id=p_user order by started_at desc limit 1 for update;
 if found and g.status='playing' and clock_timestamp()-g.last_seen>interval '8 seconds' then
  update public.rewards_nr_games set status='expired' where id=g.id returning * into g;
 end if;
 return jsonb_build_object('game',case when g.id is null then null else to_jsonb(g)-'user_id' end,'serverNow',clock_timestamp(),'nextAvailableAt',case when g.id is null then null else g.started_at+interval '4 hours' end);
end $$;
create or replace function public.rewards_nr_start(p_user uuid,p_id uuid,p_seed bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games;begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 if p_id is null or p_seed is null or p_seed not between 1 and 2147483646 then raise exception 'invalid_request';end if;
 select * into g from public.rewards_nr_games where id=p_id;
 if found then if g.user_id<>p_user then raise exception 'game_not_found';end if;return public.rewards_nr_state(p_user);end if;
 perform public.rewards_nr_state(p_user);
 select * into g from public.rewards_nr_games where user_id=p_user order by started_at desc,id limit 1;
 if found and (g.status='playing' or g.started_at+interval '4 hours'>clock_timestamp()) then return public.rewards_nr_state(p_user);end if;
 insert into public.rewards_nr_games(id,user_id,seed) values(p_id,p_user,p_seed);
 return public.rewards_nr_state(p_user);
end $$;
create or replace function public.rewards_nr_start_v2(p_user uuid,p_id uuid,p_seed bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games;begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 if p_id is null or p_seed is null or p_seed not between 1 and 2147483646 then raise exception 'invalid_request';end if;
 select * into g from public.rewards_nr_games where id=p_id;
 if found then if g.user_id<>p_user then raise exception 'game_not_found';end if;return public.rewards_nr_state(p_user);end if;
 perform public.rewards_nr_state(p_user);
 select * into g from public.rewards_nr_games where user_id=p_user order by started_at desc,id limit 1;
 if found and (g.status='playing' or g.started_at+interval '4 hours'>clock_timestamp()) then return public.rewards_nr_state(p_user);end if;
 insert into public.rewards_nr_games(id,user_id,seed,version,next_coin_tick) values(p_id,p_user,p_seed,2,public.rewards_nr_gap(p_seed,1));
 return public.rewards_nr_state(p_user);
end $$;
-- Defence in depth: the window is shared by old and new clients and all inserts.
create function public.rewards_nr_four_hour_gate() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.rewards_users where id=new.user_id for update;
 if exists(select 1 from public.rewards_nr_games where user_id=new.user_id and started_at>clock_timestamp()-interval '4 hours') then raise exception 'cooldown_active';end if;
 return new;
end $$;
create trigger rewards_nr_cooldown before insert on public.rewards_nr_games for each row execute function public.rewards_nr_four_hour_gate();

-- Existing Wordly records have no reliable start time and must not become 0s records.
alter table public.rewards_wordly_games add column started_at timestamptz,add column finished_at timestamptz,add column timing_eligible boolean not null default false;
create function public.rewards_wordly_clock() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.started_at is null then new.started_at:=clock_timestamp();new.timing_eligible:=false;end if;
 if (new.answer=any(new.guesses) or cardinality(new.guesses)>=6) and new.finished_at is null then new.finished_at:=clock_timestamp();end if;
 return new;
end $$;
create trigger rewards_wordly_clock before insert or update of guesses on public.rewards_wordly_games for each row execute function public.rewards_wordly_clock();
create function public.rewards_wordly_start(p_user_id uuid,p_day date,p_answer text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_wordly_games;begin
 if p_day is null or p_day<>(clock_timestamp() at time zone 'Europe/Moscow')::date then raise exception 'new_day';end if;
 if p_answer is null or p_answer!~'^[а-я]{5}$' then raise exception 'invalid_request';end if;
 if not exists(select 1 from public.rewards_users where id=p_user_id and not coalesce(banned,false)) then raise exception 'user_unavailable';end if;
 insert into public.rewards_wordly_games(user_id,game_day,answer,started_at,timing_eligible) values(p_user_id,p_day,p_answer,clock_timestamp(),true) on conflict do nothing;
 select * into g from public.rewards_wordly_games where user_id=p_user_id and game_day=p_day for update;
 if p_day<>(clock_timestamp() at time zone 'Europe/Moscow')::date then raise exception 'new_day';end if;
 if g.started_at is null and not(g.answer=any(g.guesses)) and cardinality(g.guesses)<6 then update public.rewards_wordly_games set started_at=clock_timestamp(),timing_eligible=false where user_id=p_user_id and game_day=p_day returning * into g;end if;
 return to_jsonb(g);
end $$;
create index rewards_ms_won_mode on public.rewards_ms_games(difficulty,user_id) where status='won' and finished_at is not null;
create index rewards_defuse_won_mode on public.rewards_defuse_games(difficulty,user_id) where status='won' and finished_at is not null;
create index rewards_wordly_timed_wins on public.rewards_wordly_games(user_id) where timing_eligible and finished_at is not null;
create function public.rewards_game_leaderboard(p_user uuid,p_game text,p_difficulty text default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.rewards_users where id=p_user and not coalesce(banned,false)) then raise exception 'user_unavailable';end if;
 if p_game is null or p_game not in('minesweeper','defuse','wordly') or (p_game='minesweeper' and (p_difficulty is null or p_difficulty not in('easy','medium','hard'))) or (p_game='defuse' and (p_difficulty is null or p_difficulty not in('rookie','swat','expert'))) or (p_game='wordly' and p_difficulty is not null) then raise exception 'invalid_request';end if;
 return (with candidates as (
 select g.user_id,greatest(0,floor(extract(epoch from(g.finished_at-g.started_at))*1000))::bigint elapsed,0 attempts,g.finished_at,g.id::text key from public.rewards_ms_games g join public.rewards_ms_settings s on s.difficulty=g.difficulty
 where p_game='minesweeper' and g.difficulty=p_difficulty and g.status='won' and g.finished_at>=g.started_at and g.reward_transaction_id is not null and g.width=s.width and g.height=s.height and g.mine_count=s.mines and g.time_seconds=s.time_seconds
 union all
 select g.user_id,greatest(0,floor(extract(epoch from(g.finished_at-g.started_at))*1000))::bigint,0,g.finished_at,g.id::text from public.rewards_defuse_games g where p_game='defuse' and g.difficulty=p_difficulty and g.status='won' and g.finished_at>=g.started_at and g.reward_transaction_id is not null
 union all
 select g.user_id,greatest(0,floor(extract(epoch from(g.finished_at-g.started_at))*1000))::bigint,cardinality(g.guesses),g.finished_at,g.game_day::text from public.rewards_wordly_games g where p_game='wordly' and g.timing_eligible and g.answer=any(g.guesses) and g.finished_at>=g.started_at and g.reward_transaction_id is not null
 ),best as (
 select distinct on(c.user_id) c.* from candidates c join public.rewards_users u on u.id=c.user_id where not coalesce(u.banned,false) order by c.user_id,c.elapsed,c.attempts,c.finished_at,c.key
 ),top_runs as(select * from best order by elapsed,attempts,finished_at,user_id,key limit 10),entries as(
 select row_number() over(order by b.elapsed,b.attempts,b.finished_at,b.user_id,b.key) rank,u.twitch_login login,u.twitch_display_name as "displayName",b.elapsed as "elapsedMs",b.attempts,b.user_id=p_user as "isMe" from top_runs b join public.rewards_users u on u.id=b.user_id
 ) select jsonb_build_object('game',p_game,'difficulty',p_difficulty,'entries',coalesce(jsonb_agg(to_jsonb(entries) order by rank),'[]'::jsonb)) from entries);
end $$;
revoke all on function public.rewards_nr_four_hour_gate(),public.rewards_wordly_clock(),public.rewards_wordly_start(uuid,date,text),public.rewards_game_leaderboard(uuid,text,text) from public,anon,authenticated;
grant execute on function public.rewards_nr_four_hour_gate(),public.rewards_wordly_clock(),public.rewards_wordly_start(uuid,date,text),public.rewards_game_leaderboard(uuid,text,text) to service_role;
