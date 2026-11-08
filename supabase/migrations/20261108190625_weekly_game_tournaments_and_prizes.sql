-- First contest: Monday 9 November 2026 00:00 Europe/Moscow. No prior payouts.
create function public.rewards_weekly_now() returns timestamptz language sql stable security invoker set search_path='' as $$select statement_timestamp()$$;
alter table public.rewards_nr_games add column finished_at timestamptz;
create function public.rewards_nr_finish_clock() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status<>'playing' and (tg_op='INSERT' or old.status='playing') then
  new.finished_at:=case when new.status='expired' then least(public.rewards_weekly_now(),new.last_seen+interval '8 seconds') else public.rewards_weekly_now() end;
 elsif tg_op='UPDATE' then new.finished_at:=old.finished_at;end if;
 return new;
end $$;
create trigger rewards_nr_finish_clock before insert or update on public.rewards_nr_games for each row execute function public.rewards_nr_finish_clock();
-- Record valid Minesweeper settings at completion, so a later admin change cannot erase a prior week's winner.
alter table public.rewards_ms_games add column weekly_config_key text;
create function public.rewards_ms_week_config() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='won' and (tg_op='INSERT' or old.status<>'won') then
  new.weekly_config_key:=case when new.reward_transaction_id is not null and exists(select 1 from public.rewards_ms_settings s where s.difficulty=new.difficulty and s.width=new.width and s.height=new.height and s.mines=new.mine_count and s.time_seconds=new.time_seconds) then concat_ws(':',new.width,new.height,new.mine_count,new.time_seconds) else null end;
 elsif tg_op='UPDATE' then new.weekly_config_key:=old.weekly_config_key;end if;
 return new;
end $$;
create trigger rewards_ms_week_config before insert or update on public.rewards_ms_games for each row execute function public.rewards_ms_week_config();
create table public.rewards_game_weeks(week_start date primary key check(week_start>='2026-11-09' and extract(isodow from week_start)=1),settled_at timestamptz);
create table public.rewards_game_week_results(
 week_start date not null references public.rewards_game_weeks(week_start),game text not null,category text not null,
 rank integer not null check(rank between 1 and 10),user_id uuid not null references public.rewards_users(id),
 score bigint not null,elapsed_ms bigint not null,attempts integer not null,completed_at timestamptz not null,result_key text not null,
 reward integer not null check(reward>=0),transaction_id uuid unique references public.rewards_coin_transactions(id),
 primary key(week_start,game,category,rank),unique(week_start,game,category,user_id),
 check((game in('night-run','wordly') and category='overall') or (game='minesweeper' and category in('easy','medium','hard')) or (game='defuse' and category in('rookie','swat','expert')))
);
alter table public.rewards_game_weeks enable row level security;
alter table public.rewards_game_week_results enable row level security;
revoke all on public.rewards_game_weeks,public.rewards_game_week_results from public,anon,authenticated;
grant select,insert,update on public.rewards_game_weeks,public.rewards_game_week_results to service_role;
create function public.rewards_game_week_prize(p_game text,p_category text,p_rank integer) returns integer language sql immutable security invoker set search_path='' as $$
select case when p_game='night-run' and p_category='overall' then case p_rank when 1 then 15 when 2 then 10 when 3 then 5 else 0 end
 when p_game='wordly' and p_category='overall' then case p_rank when 1 then 20 when 2 then 10 when 3 then 5 else 0 end
 when p_rank=1 and p_game='minesweeper' then case p_category when 'easy' then 10 when 'medium' then 20 when 'hard' then 30 else 0 end
 when p_rank=1 and p_game='defuse' then case p_category when 'rookie' then 10 when 'swat' then 20 when 'expert' then 30 else 0 end else 0 end
$$;
create function public.rewards_game_week_rankings(p_week date)
returns table(game text,category text,rank bigint,user_id uuid,score bigint,elapsed_ms bigint,attempts integer,completed_at timestamptz,result_key text)
language sql stable security invoker set search_path='' as $$
with bounds as(select p_week::timestamp at time zone 'Europe/Moscow' lo,(p_week+7)::timestamp at time zone 'Europe/Moscow' hi),candidates as(
 select 'night-run'::text game,'overall'::text category,g.user_id,case when g.version in(2,3) then g.distance/40 else g.tick::bigint*2 end score,g.tick::bigint*100 elapsed_ms,0 attempts,
 coalesce(g.finished_at,case when g.status='playing' and g.last_seen+interval '8 seconds'<=public.rewards_weekly_now() then g.last_seen+interval '8 seconds' end) completed_at,g.id::text result_key
 from public.rewards_nr_games g cross join bounds b where g.started_at>=b.lo and g.started_at<b.hi and g.tick>0 and (g.status in('stopped','crashed','expired') or g.status='playing' and g.last_seen+interval '8 seconds'<=public.rewards_weekly_now())
 union all
 select 'minesweeper',g.difficulty,g.user_id,0,greatest(0,floor(extract(epoch from(g.finished_at-g.started_at))*1000))::bigint,0,g.finished_at,g.id::text
 from public.rewards_ms_games g cross join bounds b where g.started_at>=b.lo and g.started_at<b.hi and g.status='won' and g.reward_transaction_id is not null and g.weekly_config_key=concat_ws(':',g.width,g.height,g.mine_count,g.time_seconds) and g.finished_at>=g.started_at
 union all
 select 'defuse',g.difficulty,g.user_id,0,greatest(0,floor(extract(epoch from(g.finished_at-g.started_at))*1000))::bigint,0,g.finished_at,g.id::text
 from public.rewards_defuse_games g cross join bounds b where g.started_at>=b.lo and g.started_at<b.hi and g.status='won' and g.reward_transaction_id is not null and g.finished_at>=g.started_at
 union all
 select 'wordly','overall',g.user_id,0,greatest(0,floor(extract(epoch from(g.finished_at-g.started_at))*1000))::bigint,cardinality(g.guesses),g.finished_at,g.game_day::text
 from public.rewards_wordly_games g cross join bounds b where g.started_at>=b.lo and g.started_at<b.hi and g.timing_eligible and g.answer=any(g.guesses) and g.reward_transaction_id is not null and g.finished_at>=g.started_at
),best as(
 select distinct on(c.game,c.category,c.user_id) c.* from candidates c cross join bounds b join public.rewards_users u on u.id=c.user_id where p_week>='2026-11-09' and extract(isodow from p_week)=1 and not coalesce(u.banned,false) and c.completed_at>=b.lo and c.completed_at<b.hi and c.completed_at<=public.rewards_weekly_now()
 order by c.game,c.category,c.user_id,c.score desc,c.elapsed_ms,c.attempts,c.completed_at,c.result_key
),ranked as(select x.game,x.category,row_number() over(partition by x.game,x.category order by x.score desc,x.elapsed_ms,x.attempts,x.completed_at,x.user_id,x.result_key) rank,x.user_id,x.score,x.elapsed_ms,x.attempts,x.completed_at,x.result_key from best x)
select * from ranked where rank<=10
$$;
create function public.rewards_game_week_public(p_user uuid,p_game text,p_category text) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare w date;lo timestamptz;hi timestamptz;entries jsonb;prizes jsonb;
begin
 if not exists(select 1 from public.rewards_users where id=p_user and not coalesce(banned,false)) then raise exception 'user_unavailable';end if;
 if p_game is null or p_category is null or not((p_game in('night-run','wordly') and p_category='overall') or (p_game='minesweeper' and p_category in('easy','medium','hard')) or (p_game='defuse' and p_category in('rookie','swat','expert'))) then raise exception 'invalid_request';end if;
 w:=greatest('2026-11-09'::date,date_trunc('week',public.rewards_weekly_now() at time zone 'Europe/Moscow')::date);lo:=w::timestamp at time zone 'Europe/Moscow';hi:=(w+7)::timestamp at time zone 'Europe/Moscow';
 select coalesce(jsonb_agg(jsonb_build_object('rank',x.rank,'login',u.twitch_login,'displayName',u.twitch_display_name,'distanceMeters',x.score,'elapsedTicks',x.elapsed_ms/100,'elapsedMs',x.elapsed_ms,'attempts',x.attempts,'isMe',x.user_id=p_user,'rewardCoins',public.rewards_game_week_prize(p_game,p_category,x.rank::integer)) order by x.rank),'[]'::jsonb) into entries from public.rewards_game_week_rankings(w) x join public.rewards_users u on u.id=x.user_id where x.game=p_game and x.category=p_category and public.rewards_weekly_now()>=lo;
 select jsonb_agg(public.rewards_game_week_prize(p_game,p_category,r) order by r) into prizes from generate_series(1,3) r;
 return jsonb_build_object('game',p_game,'difficulty',case when p_category='overall' then null else p_category end,'entries',entries,'weekStart',w,'weekEnd',w+6,'startsAt',lo,'endsAt',hi-interval '1 second','nextStartsAt',hi,'serverNow',public.rewards_weekly_now(),'notStarted',public.rewards_weekly_now()<lo,'prizes',prizes);
end $$;
create or replace function public.rewards_game_leaderboard(p_user uuid,p_game text,p_difficulty text default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if p_game='wordly' and p_difficulty is not null or p_game not in('minesweeper','defuse','wordly') then raise exception 'invalid_request';end if;
 return public.rewards_game_week_public(p_user,p_game,case when p_game='wordly' then 'overall' else p_difficulty end);
end $$;
create or replace function public.rewards_nr_leaderboard(p_user uuid) returns jsonb language sql stable security invoker set search_path='' as $$select public.rewards_game_week_public(p_user,'night-run','overall')$$;
create function public.rewards_game_week_settle() returns integer language plpgsql security invoker set search_path='' as $$
declare w date;hi timestamptz;r record;tx uuid;n integer:=0;done timestamptz;
begin
 if not pg_try_advisory_xact_lock(729151107,1) then return 0;end if;
 -- Never settle today or the upcoming week. Catch up at most four missed weeks per run.
 for w in select d::date from generate_series('2026-11-09'::timestamp,(date_trunc('week',public.rewards_weekly_now() at time zone 'Europe/Moscow')-interval '7 days')::timestamp,interval '7 days') d where not exists(select 1 from public.rewards_game_weeks g where g.week_start=d::date and g.settled_at is not null) order by d limit 4 loop
  hi:=(w+7)::timestamp at time zone 'Europe/Moscow';if public.rewards_weekly_now()<hi+interval '15 seconds' then continue;end if;
  insert into public.rewards_game_weeks(week_start) values(w) on conflict do nothing;
  select settled_at into done from public.rewards_game_weeks where week_start=w for update;if done is not null then continue;end if;
  -- Freeze the exact ranked results and prizes before posting any payments.
  insert into public.rewards_game_week_results(week_start,game,category,rank,user_id,score,elapsed_ms,attempts,completed_at,result_key,reward)
   select w,x.game,x.category,x.rank::integer,x.user_id,x.score,x.elapsed_ms,x.attempts,x.completed_at,x.result_key,public.rewards_game_week_prize(x.game,x.category,x.rank::integer) from public.rewards_game_week_rankings(w) x;
  for r in select * from public.rewards_game_week_results where week_start=w and reward>0 order by user_id,game,category loop
   perform 1 from public.rewards_users where id=r.user_id and not coalesce(banned,false) for update;
   if not found then update public.rewards_game_week_results set reward=0 where week_start=w and game=r.game and category=r.category and rank=r.rank;continue;end if;
   insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(r.user_id,r.reward,'adjustment','Еженедельный турнир · '||w::text||' · '||r.game||' · '||r.category||' · место '||r.rank::text) returning id into tx;
   update public.rewards_game_week_results set transaction_id=tx where week_start=w and game=r.game and category=r.category and rank=r.rank;
   n:=n+1;
  end loop;
  update public.rewards_game_weeks set settled_at=public.rewards_weekly_now() where week_start=w;
 end loop;return n;
end $$;
revoke all on function public.rewards_weekly_now(),public.rewards_nr_finish_clock(),public.rewards_ms_week_config(),public.rewards_game_week_prize(text,text,integer),public.rewards_game_week_rankings(date),public.rewards_game_week_public(uuid,text,text),public.rewards_game_week_settle(),public.rewards_nr_leaderboard(uuid),public.rewards_game_leaderboard(uuid,text,text) from public,anon,authenticated;
grant execute on function public.rewards_weekly_now(),public.rewards_nr_finish_clock(),public.rewards_ms_week_config(),public.rewards_game_week_prize(text,text,integer),public.rewards_game_week_rankings(date),public.rewards_game_week_public(uuid,text,text),public.rewards_game_week_settle(),public.rewards_nr_leaderboard(uuid),public.rewards_game_leaderboard(uuid,text,text) to service_role;
-- Supabase already has pg_cron. Keep schema tests portable without installing extensions.
do $$begin if exists(select 1 from pg_extension where extname='pg_cron') then perform cron.schedule('rewards-weekly-game-prizes','* * * * *','select public.rewards_game_week_settle();');end if;end$$;
create index rewards_nr_week_range on public.rewards_nr_games(started_at);
create index rewards_ms_week_range on public.rewards_ms_games(started_at) where status='won';
create index rewards_defuse_week_range on public.rewards_defuse_games(started_at) where status='won';
create index rewards_wordly_week_range on public.rewards_wordly_games(started_at) where timing_eligible;
