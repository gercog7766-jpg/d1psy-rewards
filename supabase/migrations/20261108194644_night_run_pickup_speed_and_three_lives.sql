alter table public.rewards_nr_games drop constraint rewards_nr_games_version_check;
alter table public.rewards_nr_games add constraint rewards_nr_games_version_check check(version in(1,2,3,4)),
 add column next_coin_distance bigint not null default 0 check(next_coin_distance>=0),
 add column last_coin_distance bigint not null default 0 check(last_coin_distance>=0),
 add constraint rewards_nr_v4_reserve check(version<>4 or (coins=collected_coins-lost_coins and lost_coins<=collected_coins and hits between 0 and 3 and (status<>'crashed' or hits=3) and (status<>'playing' or hits<3)));
create function public.rewards_nr_gap_v4(p_seed bigint,p_index integer) returns integer language sql immutable security invoker set search_path='' as $$select 400+(public.rewards_nr_hash(p_seed+777,p_index)%151)::integer$$;
create function public.rewards_nr_speed_v4(p_collected integer) returns integer language sql immutable security invoker set search_path='' as $$select 80+8*greatest(0,p_collected)$$;
create function public.rewards_nr_blocks_v4(p_seed bigint,p_row integer,p_next bigint,p_last bigint,p_collected integer) returns integer[] language plpgsql immutable security invoker set search_path='' as $$
declare d bigint:=p_row::bigint*1000;clear integer:=greatest(1000,6*public.rewards_nr_speed_v4(p_collected));n bigint;begin
 if p_row<3 or abs(d-p_next)<=clear or (p_last>0 and abs(d-p_last)<=clear) then return '{}'::integer[];end if;
 n:=public.rewards_nr_hash(p_seed,p_row);if p_row>35 and n%5=0 then return array[(n%3)::integer,((n+1)%3)::integer];end if;return array[(n%3)::integer];
end$$;
create or replace function public.rewards_nr_settle_v3(p_user uuid,p_game uuid) returns void language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games;tx uuid;amount integer;begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 select * into g from public.rewards_nr_games where id=p_game and user_id=p_user for update;
 if not found then raise exception 'game_not_found';end if;
 if g.version not in(3,4) or g.status='playing' or g.settled_at is not null then return;end if;
 amount:=case when (g.status in('stopped','expired') or g.version=4 and g.status='crashed') then g.coins else 0 end;
 if amount>0 then insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user,amount,'adjustment','NIGHT RUN · завершение забега') returning id into tx;end if;
 update public.rewards_nr_games set paid_coins=amount,settlement_transaction_id=tx,settled_at=clock_timestamp() where id=g.id;
end $$;
create or replace function public.rewards_nr_state(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games;begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 select * into g from public.rewards_nr_games where user_id=p_user order by started_at desc,id limit 1 for update;
 if found and g.status='playing' and clock_timestamp()-g.last_seen>interval '8 seconds' then update public.rewards_nr_games set status='expired' where id=g.id returning * into g;end if;
 if g.id is not null and g.version in(3,4) and g.status<>'playing' then perform public.rewards_nr_settle_v3(p_user,g.id);select * into g from public.rewards_nr_games where id=g.id;end if;
 return jsonb_build_object('game',case when g.id is null then null else to_jsonb(g)-'user_id' end,'serverNow',clock_timestamp(),'nextAvailableAt',case when g.id is null then null else g.started_at+interval '4 hours' end);
end $$;
create function public.rewards_nr_start_v4(p_user uuid,p_id uuid,p_seed bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games;begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 if p_id is null or p_seed is null or p_seed not between 1 and 2147483646 then raise exception 'invalid_request';end if;
 select * into g from public.rewards_nr_games where id=p_id;
 if found then if g.user_id<>p_user then raise exception 'game_not_found';end if;return public.rewards_nr_state(p_user);end if;
 perform public.rewards_nr_state(p_user);
 select * into g from public.rewards_nr_games where user_id=p_user order by started_at desc,id limit 1;
 if found and (g.status='playing' or g.started_at+interval '4 hours'>clock_timestamp()) then return public.rewards_nr_state(p_user);end if;
 insert into public.rewards_nr_games(id,user_id,seed,version,next_coin_tick,next_coin_distance) values(p_id,p_user,p_seed,4,public.rewards_nr_gap_v4(p_seed,1),public.rewards_nr_gap_v4(p_seed,1)::bigint*80);
 return public.rewards_nr_state(p_user);
end $$;
create function public.rewards_nr_step_v4(p_user uuid,p_game uuid,p_from integer,p_inputs integer[],p_stop boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games;target integer;maximum integer;old_d bigint;old_x integer;new_x integer;v integer;r integer;b integer;crossing bigint;hit boolean;loss integer;accepted boolean:=false;begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 if p_from is null or p_from<0 or p_inputs is null or cardinality(p_inputs)>30 or (cardinality(p_inputs)=0 and not coalesce(p_stop,false)) or exists(select 1 from unnest(p_inputs) x where x is null or x not between 0 and 2) then raise exception 'invalid_request';end if;
 select * into g from public.rewards_nr_games where id=p_game and user_id=p_user for update;
 if not found or g.version<>4 then raise exception 'game_not_found';end if;
 if p_from>g.tick then raise exception 'stale_game';end if;
 maximum:=floor(extract(epoch from(clock_timestamp()-g.started_at))*10);
 if g.status='playing' and clock_timestamp()-g.last_seen>interval '8 seconds' then g.status:='expired';
 elsif g.status='playing' and p_from=g.tick then
  accepted:=true;
  if g.tick+cardinality(p_inputs)>maximum then raise exception 'too_fast';end if;
  if maximum-(g.tick+cardinality(p_inputs))>50 then g.status:='expired';else
   foreach target in array p_inputs loop
    g.tick:=g.tick+1;old_d:=g.distance;old_x:=g.position;v:=public.rewards_nr_speed_v4(g.collected_coins);new_x:=old_x+sign(target*1000-old_x)::integer*least(abs(target*1000-old_x),500);
    g.distance:=g.distance+v;g.position:=new_x;g.lane:=floor(new_x/1000.0+0.5);hit:=false;
    if g.tick>=g.invulnerable_until_tick then
     for r in (old_d/1000+1)::integer..(g.distance/1000)::integer loop
      crossing:=r::bigint*1000-old_d;
      foreach b in array public.rewards_nr_blocks_v4(g.seed,r,g.next_coin_distance,g.last_coin_distance,g.collected_coins) loop
       if abs((old_x-b*1000)::bigint*v+(new_x-old_x)*crossing)<480*v then
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
     g.last_coin_tick:=g.next_coin_tick;g.coin_index:=g.coin_index+1;g.next_coin_tick:=g.next_coin_tick+public.rewards_nr_gap_v4(g.seed,g.coin_index);g.last_coin_distance:=g.distance;g.next_coin_distance:=g.distance+public.rewards_nr_gap_v4(g.seed,g.coin_index)::bigint*public.rewards_nr_speed_v4(g.collected_coins);
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
 for uid in select u.id from public.rewards_users u where not coalesce(u.banned,false) and exists(select 1 from public.rewards_nr_games g where g.user_id=u.id and g.version in(3,4) and g.status='playing' and g.last_seen<clock_timestamp()-interval '8 seconds') order by u.id limit p_limit for update of u skip locked loop
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
 if g.version=4 then return public.rewards_nr_step_v4(p_user,p_game,p_from,p_inputs,p_stop);end if;
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
 select 'night-run'::text game,'overall'::text category,g.user_id,case when g.version in(2,3,4) then g.distance/40 else g.tick::bigint*2 end score,g.tick::bigint*100 elapsed_ms,0 attempts,
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
create or replace function public.rewards_nr_start_v3(p_user uuid,p_id uuid,p_seed bigint) returns jsonb language plpgsql security invoker set search_path='' as $$begin return public.rewards_nr_start(p_user,p_id,p_seed);end$$;
revoke all on function public.rewards_nr_start_v4(uuid,uuid,bigint),public.rewards_nr_step_v4(uuid,uuid,integer,integer[],boolean),public.rewards_nr_gap_v4(bigint,integer),public.rewards_nr_speed_v4(integer),public.rewards_nr_blocks_v4(bigint,integer,bigint,bigint,integer) from public,anon,authenticated;
grant execute on function public.rewards_nr_start_v4(uuid,uuid,bigint),public.rewards_nr_step_v4(uuid,uuid,integer,integer[],boolean),public.rewards_nr_gap_v4(bigint,integer),public.rewards_nr_speed_v4(integer),public.rewards_nr_blocks_v4(bigint,integer,bigint,bigint,integer) to service_role;
