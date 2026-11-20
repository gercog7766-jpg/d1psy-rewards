-- Version 5 applies only to new runs; already-started games keep their original physics and payouts.
alter table public.rewards_nr_games drop constraint rewards_nr_games_version_check;
alter table public.rewards_nr_games add constraint rewards_nr_games_version_check check(version in(1,2,3,4,5));
alter table public.rewards_nr_games drop constraint rewards_nr_v4_reserve;
alter table public.rewards_nr_games add constraint rewards_nr_v4_reserve check(version not in(4,5) or (coins=collected_coins-lost_coins and lost_coins<=collected_coins and hits between 0 and 3 and (status<>'crashed' or hits=3) and (status<>'playing' or hits<3)));
create function public.rewards_nr_gap_v5(p_seed bigint,p_index integer) returns integer language sql immutable set search_path='' as $$select 550+(public.rewards_nr_hash(p_seed+777,p_index)%101)::integer$$;
create function public.rewards_nr_speed_v5(p_collected integer) returns integer language plpgsql immutable set search_path='' as $$
declare v bigint:=20;i integer;begin
 for i in 1..greatest(0,p_collected) loop v:=(v*11+5)/10;end loop;
 return (v*4)::integer;
end$$;
create function public.rewards_nr_speed_pickup(p_version integer,p_collected integer) returns integer language sql immutable set search_path='' as $$select case when p_version=5 then public.rewards_nr_speed_v5(p_collected) else public.rewards_nr_speed_v4(p_collected) end$$;
create function public.rewards_nr_gap_pickup(p_version integer,p_seed bigint,p_index integer) returns integer language sql immutable set search_path='' as $$select case when p_version=5 then public.rewards_nr_gap_v5(p_seed,p_index) else public.rewards_nr_gap_v4(p_seed,p_index) end$$;
create function public.rewards_nr_blocks_pickup(p_version integer,p_seed bigint,p_row integer,p_next bigint,p_last bigint,p_speed integer) returns integer[] language plpgsql immutable set search_path='' as $$
declare d bigint:=p_row::bigint*1000;clear bigint:=greatest(1000,6::bigint*p_speed);n bigint;begin
 if p_row<3 or abs(d-p_next)<=clear or (p_last>0 and abs(d-p_last)<=clear) then return '{}'::integer[];end if;
 n:=public.rewards_nr_hash(p_seed,p_row);if p_row>35 and n%5=0 then return array[(n%3)::integer,((n+1)%3)::integer];end if;return array[(n%3)::integer];
end$$;
create or replace function public.rewards_nr_settle_v3(p_user uuid,p_game uuid) returns void language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games;tx uuid;amount integer;begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 select * into g from public.rewards_nr_games where id=p_game and user_id=p_user for update;
 if not found then raise exception 'game_not_found';end if;
 if g.version not in(3,4,5) or g.status='playing' or g.settled_at is not null then return;end if;
 amount:=case when (g.status in('stopped','expired') or g.version in(4,5) and g.status='crashed') then g.coins else 0 end;
 if amount>0 then insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user,amount,'adjustment','NIGHT RUN · завершение забега') returning id into tx;end if;
 update public.rewards_nr_games set paid_coins=amount,settlement_transaction_id=tx,settled_at=clock_timestamp() where id=g.id;
end $$;
create or replace function public.rewards_nr_state(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games;begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 select * into g from public.rewards_nr_games where user_id=p_user order by started_at desc,id limit 1 for update;
 if found and g.status='playing' and clock_timestamp()-g.last_seen>interval '8 seconds' then update public.rewards_nr_games set status='expired' where id=g.id returning * into g;end if;
 if g.id is not null and g.version in(3,4,5) and g.status<>'playing' then perform public.rewards_nr_settle_v3(p_user,g.id);select * into g from public.rewards_nr_games where id=g.id;end if;
 return jsonb_build_object('game',case when g.id is null then null else to_jsonb(g)-'user_id' end,'serverNow',clock_timestamp(),'nextAvailableAt',case when g.id is null then null else g.started_at+interval '4 hours' end);
end $$;
create or replace function public.rewards_nr_start_v5(p_user uuid,p_id uuid,p_seed bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games;begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 if p_id is null or p_seed is null or p_seed not between 1 and 2147483646 then raise exception 'invalid_request';end if;
 select * into g from public.rewards_nr_games where id=p_id;
 if found then if g.user_id<>p_user then raise exception 'game_not_found';end if;return public.rewards_nr_state(p_user);end if;
 perform public.rewards_nr_state(p_user);
 select * into g from public.rewards_nr_games where user_id=p_user order by started_at desc,id limit 1;
 if found and (g.status='playing' or g.started_at+interval '4 hours'>clock_timestamp()) then return public.rewards_nr_state(p_user);end if;
 insert into public.rewards_nr_games(id,user_id,seed,version,next_coin_tick,next_coin_distance) values(p_id,p_user,p_seed,5,public.rewards_nr_gap_v5(p_seed,1),public.rewards_nr_gap_v5(p_seed,1)::bigint*80);
 return public.rewards_nr_state(p_user);
end $$;
create or replace function public.rewards_nr_step_v4(p_user uuid,p_game uuid,p_from integer,p_inputs integer[],p_stop boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games;target integer;maximum integer;old_d bigint;old_x integer;new_x integer;v integer;r integer;b integer;crossing bigint;hit boolean;loss integer;accepted boolean:=false;begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 if p_from is null or p_from<0 or p_inputs is null or cardinality(p_inputs)>30 or (cardinality(p_inputs)=0 and not coalesce(p_stop,false)) or exists(select 1 from unnest(p_inputs) x where x is null or x not between 0 and 2) then raise exception 'invalid_request';end if;
 select * into g from public.rewards_nr_games where id=p_game and user_id=p_user for update;
 if not found or g.version not in(4,5) then raise exception 'game_not_found';end if;
 if p_from>g.tick then raise exception 'stale_game';end if;
 maximum:=floor(extract(epoch from(clock_timestamp()-g.started_at))*10);
 if g.status='playing' and clock_timestamp()-g.last_seen>interval '8 seconds' then g.status:='expired';
 elsif g.status='playing' and p_from=g.tick then
  accepted:=true;
  if g.tick+cardinality(p_inputs)>maximum then raise exception 'too_fast';end if;
  if maximum-(g.tick+cardinality(p_inputs))>50 then g.status:='expired';else
   v:=public.rewards_nr_speed_pickup(g.version,g.collected_coins);
   foreach target in array p_inputs loop
    g.tick:=g.tick+1;old_d:=g.distance;old_x:=g.position;new_x:=old_x+sign(target*1000-old_x)::integer*least(abs(target*1000-old_x),500);
    g.distance:=g.distance+v;g.position:=new_x;g.lane:=floor(new_x/1000.0+0.5);hit:=false;
    if g.tick>=g.invulnerable_until_tick then
     for r in (old_d/1000+1)::integer..(g.distance/1000)::integer loop
      crossing:=r::bigint*1000-old_d;
      foreach b in array public.rewards_nr_blocks_pickup(g.version,g.seed,r,g.next_coin_distance,g.last_coin_distance,v) loop
       if abs((old_x-b*1000)::bigint*v+(new_x-old_x)*crossing)<480::bigint*v then
        loss:=least(case g.hits when 0 then 6 when 1 then 9 else 5 end,g.coins);g.coins:=g.coins-loss;g.lost_coins:=g.lost_coins+loss;g.hits:=g.hits+1;g.last_hit_tick:=g.tick;g.invulnerable_until_tick:=g.tick+10;hit:=true;
        insert into public.rewards_nr_v3_events(game_id,tick,kind,amount,coins_after) values(g.id,g.tick,'hit',loss,g.coins);
        if g.hits>=3 then g.status:='crashed';g.distance:=r::bigint*1000;g.position:=floor(old_x+(new_x-old_x)*crossing::numeric/v+0.5);g.lane:=floor(g.position/1000.0+0.5);end if;exit;
       end if;
      end loop;
      if hit then exit;end if;
     end loop;
    end if;
    if g.status='crashed' then exit;end if;
    if g.tick=g.next_coin_tick then
     if abs(g.position-(public.rewards_nr_hash(g.seed+999,g.coin_index)%3)*1000)<=380 then g.coins:=g.coins+1;g.collected_coins:=g.collected_coins+1;insert into public.rewards_nr_v3_events(game_id,tick,kind,amount,coins_after) values(g.id,g.tick,'pickup',1,g.coins);end if;
     v:=public.rewards_nr_speed_pickup(g.version,g.collected_coins);g.last_coin_tick:=g.next_coin_tick;g.coin_index:=g.coin_index+1;g.next_coin_tick:=g.next_coin_tick+public.rewards_nr_gap_pickup(g.version,g.seed,g.coin_index);g.last_coin_distance:=g.distance;g.next_coin_distance:=g.distance+public.rewards_nr_gap_pickup(g.version,g.seed,g.coin_index)::bigint*v;
    end if;
   end loop;
   if coalesce(p_stop,false) and g.status='playing' then g.status:='stopped';end if;
  end if;
 end if;
 -- Replayed old checkpoints are observational: never refresh their heartbeat.
 if accepted or g.status<>'playing' then
  update public.rewards_nr_games set tick=g.tick,lane=g.lane,position=g.position,distance=g.distance,coins=g.coins,status=g.status,coin_index=g.coin_index,next_coin_tick=g.next_coin_tick,last_coin_tick=g.last_coin_tick,next_coin_distance=g.next_coin_distance,last_coin_distance=g.last_coin_distance,collected_coins=g.collected_coins,lost_coins=g.lost_coins,hits=g.hits,last_hit_tick=g.last_hit_tick,invulnerable_until_tick=g.invulnerable_until_tick,last_seen=case when accepted then clock_timestamp() else last_seen end where id=g.id;
 end if;
 if g.status<>'playing' then perform public.rewards_nr_settle_v3(p_user,g.id);end if;
 select * into g from public.rewards_nr_games where id=p_game;
 return jsonb_build_object('game',to_jsonb(g)-'user_id','serverNow',clock_timestamp(),'nextAvailableAt',g.started_at+interval '4 hours');
end $$;
create or replace function public.rewards_nr_expire_v3(p_limit integer default 30) returns integer language plpgsql security invoker set search_path='' as $$
declare uid uuid;n integer:=0;begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_request';end if;
 for uid in select u.id from public.rewards_users u where not coalesce(u.banned,false) and exists(select 1 from public.rewards_nr_games g where g.user_id=u.id and g.version in(3,4,5) and g.status='playing' and g.last_seen<clock_timestamp()-interval '8 seconds') order by u.id limit p_limit for update of u skip locked loop
  perform public.rewards_nr_state(uid);n:=n+1;
 end loop;return n;
end $$;
create or replace function public.rewards_nr_step(p_user uuid,p_game uuid,p_from integer,p_inputs integer[],p_stop boolean default false)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games%rowtype;target integer;t integer;maximum integer;tx uuid;
begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 if p_from is null or p_from<0 or p_inputs is null or cardinality(p_inputs)>30 or
 (cardinality(p_inputs)=0 and not coalesce(p_stop,false)) or exists(select 1 from unnest(p_inputs) x where x is null or x not between 0 and 2) then raise exception 'invalid_request';end if;
 select * into g from public.rewards_nr_games where id=p_game and user_id=p_user for update;
 if not found then raise exception 'game_not_found';end if;
 if g.version in(4,5) then return public.rewards_nr_step_v4(p_user,p_game,p_from,p_inputs,p_stop);end if;
 if g.version=3 then return public.rewards_nr_step_v3(p_user,p_game,p_from,p_inputs,p_stop);end if;
 if g.version=2 then return public.rewards_nr_step_v2(p_user,p_game,p_from,p_inputs,p_stop);end if;
 if p_from>g.tick then raise exception 'stale_game';end if;
 -- Already committed checkpoints return the saved state; they cannot pay twice.
 if p_from<g.tick or g.status<>'playing' then return jsonb_build_object('game',to_jsonb(g)-'user_id','serverNow',clock_timestamp());end if;
 maximum=floor(extract(epoch from (clock_timestamp()-g.started_at))*10);
 if g.tick+cardinality(p_inputs)>maximum then raise exception 'too_fast';end if;
 if clock_timestamp()-g.last_seen>interval '8 seconds' or maximum-(g.tick+cardinality(p_inputs))>50 then
  g.status='expired';
 else
  foreach target in array p_inputs loop
   g.tick=g.tick+1;g.lane=g.lane+sign(target-g.lane)::integer;
   if g.tick%12=0 and g.lane=any(public.rewards_nr_blocks(g.seed,g.tick/12)) then g.status='crashed';exit;end if;
   if g.tick%600=0 and g.lane=(public.rewards_nr_hash(g.seed+999,g.tick/600)%3)::integer then
    insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
     values(p_user,1,'adjustment','NIGHT RUN · монета · '||(g.tick/600)::text) returning id into tx;
    insert into public.rewards_nr_rewards(game_id,minute,transaction_id) values(g.id,g.tick/600,tx);
    g.coins=g.coins+1;
   end if;
  end loop;
  if coalesce(p_stop,false) and g.status='playing' then g.status='stopped';end if;
 end if;
 update public.rewards_nr_games set tick=g.tick,lane=g.lane,coins=g.coins,status=g.status,last_seen=clock_timestamp() where id=g.id returning * into g;
 return jsonb_build_object('game',to_jsonb(g)-'user_id','serverNow',clock_timestamp());
end $$;
create or replace function public.rewards_game_week_rankings(p_week date)
returns table(game text,category text,rank bigint,user_id uuid,score bigint,elapsed_ms bigint,attempts integer,completed_at timestamptz,result_key text)
language sql stable security invoker set search_path='' as $$
with bounds as(select p_week::timestamp at time zone 'Europe/Moscow' lo,(p_week+7)::timestamp at time zone 'Europe/Moscow' hi),candidates as(
 select 'night-run'::text game,'overall'::text category,g.user_id,case when g.version in(2,3,4,5) then g.distance/40 else g.tick::bigint*2 end score,g.tick::bigint*100 elapsed_ms,0 attempts,
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
create or replace function public.rewards_player_statistics(p_user uuid,p_page integer default 0) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare u public.rewards_users;wallet jsonb;games jsonb;records jsonb;nr jsonb;wordly jsonb;history jsonb;tournaments jsonb;awards bigint;begin
 if p_page is null or p_page<0 or p_page>100000 then raise exception 'invalid_page';end if;
 select * into u from public.rewards_users where id=p_user and not coalesce(banned,false);if not found then raise exception 'user_unavailable';end if;
 select jsonb_build_object('balance',coalesce(sum(amount),0),'credited',coalesce(sum(amount) filter(where amount>0),0),'debited',coalesce(-sum(amount) filter(where amount<0),0),'creditCount',count(*) filter(where amount>0)) into wallet from public.rewards_coin_transactions where user_id=p_user;
 with totals as(
 select 1 ord,'night-run' game,count(*) played,null::bigint wins,null::bigint draws from public.rewards_nr_games where user_id=p_user and status in('stopped','crashed','expired') and tick>0
 union all select 2,'minesweeper',count(*),count(*) filter(where status='won'),null from public.rewards_ms_games where user_id=p_user and status in('won','lost')
 union all select 3,'defuse',count(*),count(*) filter(where status='won'),null from public.rewards_defuse_games where user_id=p_user and status in('won','lost')
 union all select 4,'wordly',count(*),count(*) filter(where answer=any(guesses)),null from public.rewards_wordly_games where user_id=p_user and (answer=any(guesses) or cardinality(guesses)>=6)
 union all select 5,'tic-tac-toe',count(*),count(*) filter(where winner_id=p_user),count(*) filter(where winner_id is null) from public.rewards_ttt_rooms where (host_id=p_user or guest_id=p_user) and status='finished' and guest_id is not null
 ) select jsonb_agg(jsonb_build_object('game',game,'played',played,'wins',wins,'draws',draws) order by ord) into games from totals;
 select jsonb_build_object('distanceMeters',case when version in(2,3,4,5) then distance/40 else tick::bigint*2 end,'elapsedMs',tick::bigint*100) into nr from public.rewards_nr_games where user_id=p_user and status in('stopped','crashed','expired') and tick>0 order by case when version in(2,3,4,5) then distance/40 else tick::bigint*2 end desc,tick desc,id limit 1;
 select jsonb_build_object('elapsedMs',floor(extract(epoch from(finished_at-started_at))*1000)::bigint,'attempts',cardinality(guesses)) into wordly from public.rewards_wordly_games where user_id=p_user and answer=any(guesses) and timing_eligible and reward_transaction_id is not null and finished_at>=started_at order by finished_at-started_at,cardinality(guesses),game_day limit 1;
 with candidates as(
 select 'minesweeper'::text game,difficulty category,floor(extract(epoch from(finished_at-started_at))*1000)::bigint elapsed_ms,width,height,mine_count mines,id from public.rewards_ms_games where user_id=p_user and status='won' and reward_transaction_id is not null and finished_at>=started_at
 union all select 'defuse',difficulty,floor(extract(epoch from(finished_at-started_at))*1000)::bigint,null,null,null,id from public.rewards_defuse_games where user_id=p_user and status='won' and reward_transaction_id is not null and finished_at>=started_at
 ),ranked as(select *,row_number() over(partition by game,category order by elapsed_ms,id) n from candidates)
 select coalesce(jsonb_agg(jsonb_build_object('game',game,'category',category,'elapsedMs',elapsed_ms,'width',width,'height',height,'mines',mines) order by game,category),'[]') into records from ranked where n=1;
 select coalesce(jsonb_agg(x order by x.created_at desc,x.sort_id desc),'[]') into history from(select id sort_id,amount,transaction_type,note,created_at from public.rewards_coin_transactions where user_id=p_user and amount>0 order by created_at desc,id desc limit 20 offset p_page*20)x;
 -- Internal sort IDs are removed from the client-facing history.
 select coalesce(jsonb_agg(value-'sort_id' order by n),'[]') into history from jsonb_array_elements(history) with ordinality h(value,n);
 select coalesce(sum(reward),0) into awards from public.rewards_game_week_results where user_id=p_user and reward>0 and transaction_id is not null;
 select coalesce(jsonb_agg(x order by x.week_start desc,x.game,x.category),'[]') into tournaments from(select week_start,game,category,rank,reward from public.rewards_game_week_results where user_id=p_user and reward>0 and transaction_id is not null order by week_start desc,game,category limit 20)x;
 return jsonb_build_object('user',jsonb_build_object('login',u.twitch_login,'displayName',u.twitch_display_name,'avatarUrl',u.twitch_avatar_url,'xp',u.xp_total,'joinedAt',u.created_at),'wallet',wallet,'games',games,'records',jsonb_build_object('nightRun',nr,'wordly',wordly,'modes',records),'tournamentCoins',awards,'tournaments',tournaments,'history',history,'page',p_page,'pageSize',20);
end$$;
create or replace function public.rewards_s1_new_game_tasks() returns trigger
language plpgsql set search_path = '' as $$
declare
  today text := public.rewards_s1_day();
  week text := public.rewards_s1_week();
  challenge_start constant timestamptz := '2026-11-15 21:00:00+00';
  elapsed interval;
begin
  case tg_table_name
  when 'rewards_checkers_rooms' then
    if old.status='active' and new.status in ('won','draw') and new.guest_id is not null then
      perform public.rewards_season_add_task_progress(player,'checkers_play',1,1,150,today,true)
      from unnest(array[new.host_id,new.guest_id]) player order by player;
    end if;
  when 'rewards_black_box_bids' then
    perform public.rewards_season_add_task_progress(new.user_id,'black_box_bid',1,1,150,today,true);
  when 'rewards_ms_games' then
    if old.status='playing' and new.status in ('won','lost') then
      perform public.rewards_season_add_task_progress(new.user_id,'minesweeper_play',1,1,150,today,true);
      elapsed := new.finished_at-new.started_at;
      if new.status='won' and elapsed>=interval '0 seconds' then
        if elapsed<interval '25 seconds' then
          perform public.rewards_season_add_task_progress(new.user_id,'minesweeper_under_25',1,1,700,week,false);
        end if;
        if new.difficulty='hard' and new.finished_at>=challenge_start and elapsed<interval '270 seconds' then
          perform public.rewards_season_add_task_progress(new.user_id,'minesweeper_hard_under_270',1,1,1500,'season',false);
        end if;
      end if;
    end if;
  when 'rewards_defuse_games' then
    if old.status='playing' and new.status in ('won','lost') then
      perform public.rewards_season_add_task_progress(new.user_id,'defuse_play',1,1,150,today,true);
      elapsed := new.finished_at-new.started_at;
      if new.status='won' and new.difficulty='swat' and elapsed>=interval '0 seconds' and elapsed<interval '16 seconds' then
        perform public.rewards_season_add_task_progress(new.user_id,'defuse_swat_under_16',1,1,800,week,false);
      end if;
    end if;
  when 'rewards_guess_rounds' then
    if old.status<>'won' and new.status='won' and new.winner_id is not null then
      perform public.rewards_season_add_task_progress(new.winner_id,'guess_word_win',1,1,800,week,false);
    end if;
  when 'rewards_nr_games' then
    if old.status='playing' and new.status in ('stopped','crashed','expired')
      and new.started_at>=challenge_start and new.finished_at>=challenge_start
      and (case when new.version in (2,3,4,5) then new.distance/40 else new.tick::bigint*2 end)>111111 then
      perform public.rewards_season_add_task_progress(new.user_id,'night_run_over_111111',1,1,2000,'season',false);
    end if;
  when 'rewards_red_button_holds' then
    if old.ended_at is null and new.ended_at is not null then
      -- The interval belongs to the week in which it was held, including a Sunday hold closed at midnight.
      perform public.rewards_s1_sync_red_hold(new.user_id,new.started_at);
    end if;
  end case;
  return new;
end;
$$;
create or replace function public.rewards_ms_public(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.rewards_ms_cycles;g public.rewards_ms_games;cells jsonb;levels jsonb;
begin
 select * into c from public.rewards_ms_cycles where user_id=p_user;
 select * into g from public.rewards_ms_games where user_id=p_user and cycle_id=c.cycle_id order by attempt desc limit 1;
 select jsonb_agg(jsonb_build_object('difficulty',difficulty,'mines',mines,'reward',reward,'timeLimitSeconds',time_seconds,'width',width,'height',height) order by reward) into levels from public.rewards_ms_settings;
 if g.id is not null then
  with opened as (select unnest(g.opened) i),flags as (select unnest(g.flags) i),mines as (select unnest(g.mines) i),
   counts as (select o.i,count(m.i)::int value from opened o cross join lateral unnest(public.rewards_ms_neighbors(o.i,g.width,g.height)) n(cell) left join mines m on m.i=n.cell group by o.i)
  select jsonb_agg(jsonb_build_object('index',grid.i,'open',o.i is not null,'flag',f.i is not null,
   'mine',g.status<>'playing' and m.i is not null,
   'value',case when o.i is not null then case when m.i is not null then -1 else coalesce(a.value,0) end end) order by grid.i) into cells
  from generate_series(0,g.width*g.height-1) grid(i) left join opened o on o.i=grid.i left join flags f on f.i=grid.i left join mines m on m.i=grid.i left join counts a on a.i=grid.i;
 end if;
 return jsonb_build_object('serverNow',clock_timestamp(),'attemptsLeft',case when c.cooldown_until is not null then 0 else 3-coalesce(c.attempts_used,0) end,
  'cooldownUntil',c.cooldown_until,'levels',levels,'game',case when g.id is null then null else jsonb_build_object(
  'id',g.id,'attempt',g.attempt,'difficulty',g.difficulty,'mineCount',g.mine_count,'reward',g.reward,'status',g.status,'version',g.version,
  'width',g.width,'height',g.height,'timeLimitSeconds',g.time_seconds,'startedAt',g.started_at,'deadlineAt',g.deadline_at,'timedOut',g.timed_out,'finishedAt',g.finished_at,'cells',cells) end);
end $$;
create or replace function public.rewards_ms_move(p_user uuid,p_game uuid,p_version integer,p_action text,p_cell integer,p_request uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_ms_games;c public.rewards_ms_cycles;queue integer[];queued boolean[];head integer:=1;neighbor integer;neighbors integer[];cell integer;adj integer;flagged integer;payload text;stamp timestamptz;tx uuid;
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
 queued:=array_fill(false,array[g.width*g.height]);
 foreach neighbor in array queue loop queued[neighbor+1]:=true;end loop;
 while head<=cardinality(queue) loop
  cell:=queue[head];head:=head+1;
  if cell=any(g.opened) or cell=any(g.flags) then continue;end if;
  g.opened:=array_append(g.opened,cell);
  if cell=any(g.mines) then g.status:='lost';exit;end if;
  neighbors:=public.rewards_ms_neighbors(cell,g.width,g.height);
  select count(*) into adj from unnest(neighbors) n where n=any(g.mines);
  if adj=0 then
   foreach neighbor in array neighbors loop
    if not queued[neighbor+1] and not neighbor=any(g.opened) and not neighbor=any(g.flags) then
     queued[neighbor+1]:=true;queue:=array_append(queue,neighbor);
    end if;
   end loop;
  end if;
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
revoke all on function public.rewards_nr_start_v5(uuid,uuid,bigint),public.rewards_nr_gap_v5(bigint,integer),public.rewards_nr_speed_v5(integer),public.rewards_nr_speed_pickup(integer,integer),public.rewards_nr_gap_pickup(integer,bigint,integer),public.rewards_nr_blocks_pickup(integer,bigint,integer,bigint,bigint,integer) from public,anon,authenticated;
grant execute on function public.rewards_nr_start_v5(uuid,uuid,bigint),public.rewards_nr_gap_v5(bigint,integer),public.rewards_nr_speed_v5(integer),public.rewards_nr_speed_pickup(integer,integer),public.rewards_nr_gap_pickup(integer,bigint,integer),public.rewards_nr_blocks_pickup(integer,bigint,integer,bigint,bigint,integer) to service_role;
notify pgrst,'reload schema';
