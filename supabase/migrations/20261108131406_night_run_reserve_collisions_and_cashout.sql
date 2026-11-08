alter table public.rewards_nr_games drop constraint rewards_nr_games_version_check;
alter table public.rewards_nr_games add constraint rewards_nr_games_version_check check(version in(1,2,3)),
 add column collected_coins integer not null default 0 check(collected_coins>=0),
 add column lost_coins integer not null default 0 check(lost_coins>=0),
 add column hits integer not null default 0 check(hits>=0),
 add column last_hit_tick integer not null default 0 check(last_hit_tick>=0),
 add column invulnerable_until_tick integer not null default 0 check(invulnerable_until_tick>=0),
 add column paid_coins integer not null default 0 check(paid_coins>=0),
 add column settled_at timestamptz,
 add column settlement_transaction_id uuid unique references public.rewards_coin_transactions(id),
 add constraint rewards_nr_v3_reserve check(version<>3 or (coins=collected_coins-lost_coins and lost_coins<=collected_coins and (status<>'crashed' or coins=0)));
create table public.rewards_nr_v3_events(game_id uuid not null references public.rewards_nr_games(id) on delete cascade,tick integer not null check(tick>0),kind text not null check(kind in('hit','pickup')),amount integer not null check(amount>=0),coins_after integer not null check(coins_after>=0),primary key(game_id,tick,kind));
alter table public.rewards_nr_v3_events enable row level security;
revoke all on public.rewards_nr_v3_events from public,anon,authenticated;
grant select,insert on public.rewards_nr_v3_events to service_role;
create function public.rewards_nr_settle_v3(p_user uuid,p_game uuid) returns void language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games;tx uuid;amount integer;begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 select * into g from public.rewards_nr_games where id=p_game and user_id=p_user for update;
 if not found then raise exception 'game_not_found';end if;
 if g.version<>3 or g.status='playing' or g.settled_at is not null then return;end if;
 amount:=case when g.status in('stopped','expired') then g.coins else 0 end;
 if amount>0 then insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user,amount,'adjustment','NIGHT RUN · завершение забега') returning id into tx;end if;
 update public.rewards_nr_games set paid_coins=amount,settlement_transaction_id=tx,settled_at=clock_timestamp() where id=g.id;
end $$;
create or replace function public.rewards_nr_state(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games;begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 select * into g from public.rewards_nr_games where user_id=p_user order by started_at desc,id limit 1 for update;
 if found and g.status='playing' and clock_timestamp()-g.last_seen>interval '8 seconds' then update public.rewards_nr_games set status='expired' where id=g.id returning * into g;end if;
 if g.id is not null and g.version=3 and g.status<>'playing' then perform public.rewards_nr_settle_v3(p_user,g.id);select * into g from public.rewards_nr_games where id=g.id;end if;
 return jsonb_build_object('game',case when g.id is null then null else to_jsonb(g)-'user_id' end,'serverNow',clock_timestamp(),'nextAvailableAt',case when g.id is null then null else g.started_at+interval '4 hours' end);
end $$;
create function public.rewards_nr_start_v3(p_user uuid,p_id uuid,p_seed bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games;begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 if p_id is null or p_seed is null or p_seed not between 1 and 2147483646 then raise exception 'invalid_request';end if;
 select * into g from public.rewards_nr_games where id=p_id;
 if found then if g.user_id<>p_user then raise exception 'game_not_found';end if;return public.rewards_nr_state(p_user);end if;
 perform public.rewards_nr_state(p_user);
 select * into g from public.rewards_nr_games where user_id=p_user order by started_at desc,id limit 1;
 if found and (g.status='playing' or g.started_at+interval '4 hours'>clock_timestamp()) then return public.rewards_nr_state(p_user);end if;
 insert into public.rewards_nr_games(id,user_id,seed,version,next_coin_tick) values(p_id,p_user,p_seed,3,public.rewards_nr_gap(p_seed,1));
 return public.rewards_nr_state(p_user);
end $$;
-- Old active games finish under their original already-paid rules. New old-version
-- games are rejected, so cached clients cannot bypass the reserve mechanic.
create or replace function public.rewards_nr_start(p_user uuid,p_id uuid,p_seed bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games;begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 if p_id is null or p_seed is null or p_seed not between 1 and 2147483646 then raise exception 'invalid_request';end if;
 select * into g from public.rewards_nr_games where id=p_id;
 if found then if g.user_id<>p_user then raise exception 'game_not_found';end if;return public.rewards_nr_state(p_user);end if;
 if exists(select 1 from public.rewards_nr_games where user_id=p_user and status='playing') then return public.rewards_nr_state(p_user);end if;
 raise exception 'client_update_required';
end $$;
create or replace function public.rewards_nr_start_v2(p_user uuid,p_id uuid,p_seed bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
begin return public.rewards_nr_start(p_user,p_id,p_seed);end $$;
create function public.rewards_nr_step_v3(p_user uuid,p_game uuid,p_from integer,p_inputs integer[],p_stop boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games;target integer;maximum integer;old_d bigint;old_x integer;new_x integer;v integer;r integer;b integer;crossing bigint;hit boolean;loss integer;accepted boolean:=false;begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 if p_from is null or p_from<0 or p_inputs is null or cardinality(p_inputs)>30 or (cardinality(p_inputs)=0 and not coalesce(p_stop,false)) or exists(select 1 from unnest(p_inputs) x where x is null or x not between 0 and 2) then raise exception 'invalid_request';end if;
 select * into g from public.rewards_nr_games where id=p_game and user_id=p_user for update;
 if not found or g.version<>3 then raise exception 'game_not_found';end if;
 if p_from>g.tick then raise exception 'stale_game';end if;
 maximum:=floor(extract(epoch from(clock_timestamp()-g.started_at))*10);
 if g.status='playing' and clock_timestamp()-g.last_seen>interval '8 seconds' then g.status:='expired';
 elsif g.status='playing' and p_from=g.tick then
  accepted:=true;
  if g.tick+cardinality(p_inputs)>maximum then raise exception 'too_fast';end if;
  if maximum-(g.tick+cardinality(p_inputs))>50 then g.status:='expired';else
   foreach target in array p_inputs loop
    g.tick:=g.tick+1;old_d:=g.distance;old_x:=g.position;v:=public.rewards_nr_speed(g.tick);new_x:=old_x+sign(target*1000-old_x)::integer*least(abs(target*1000-old_x),500);
    g.distance:=g.distance+v;g.position:=new_x;g.lane:=floor(new_x/1000.0+0.5);hit:=false;
    if g.tick>=g.invulnerable_until_tick then
     for r in (old_d/1000+1)::integer..(g.distance/1000)::integer loop
      crossing:=r::bigint*1000-old_d;
      foreach b in array public.rewards_nr_blocks_v2(g.seed,r,g.next_coin_tick,g.last_coin_tick) loop
       if abs((old_x-b*1000)::bigint*v+(new_x-old_x)*crossing)<480*v then
        loss:=least(5,g.coins);g.coins:=g.coins-loss;g.lost_coins:=g.lost_coins+loss;g.hits:=g.hits+1;g.last_hit_tick:=g.tick;g.invulnerable_until_tick:=g.tick+20;hit:=true;
        insert into public.rewards_nr_v3_events(game_id,tick,kind,amount,coins_after) values(g.id,g.tick,'hit',loss,g.coins);
        if g.coins=0 then g.status:='crashed';g.distance:=r::bigint*1000;g.position:=floor(old_x+(new_x-old_x)*crossing::numeric/v+0.5);g.lane:=floor(g.position/1000.0+0.5);end if;exit;
       end if;
      end loop;
      if hit then exit;end if;
     end loop;
    end if;
    if g.status='crashed' then exit;end if;
    if g.tick=g.next_coin_tick then
     if abs(g.position-(public.rewards_nr_hash(g.seed+999,g.coin_index)%3)*1000)<=380 then g.coins:=g.coins+1;g.collected_coins:=g.collected_coins+1;insert into public.rewards_nr_v3_events(game_id,tick,kind,amount,coins_after) values(g.id,g.tick,'pickup',1,g.coins);end if;
     g.last_coin_tick:=g.next_coin_tick;g.coin_index:=g.coin_index+1;g.next_coin_tick:=g.next_coin_tick+public.rewards_nr_gap(g.seed,g.coin_index);
    end if;
   end loop;
   if coalesce(p_stop,false) and g.status='playing' then g.status:='stopped';end if;
  end if;
 end if;
 -- Replayed old checkpoints are observational: never refresh their heartbeat.
 if accepted or g.status<>'playing' then
  update public.rewards_nr_games set tick=g.tick,lane=g.lane,position=g.position,distance=g.distance,coins=g.coins,status=g.status,coin_index=g.coin_index,next_coin_tick=g.next_coin_tick,last_coin_tick=g.last_coin_tick,collected_coins=g.collected_coins,lost_coins=g.lost_coins,hits=g.hits,last_hit_tick=g.last_hit_tick,invulnerable_until_tick=g.invulnerable_until_tick,last_seen=case when accepted then clock_timestamp() else last_seen end where id=g.id;
 end if;
 if g.status<>'playing' then perform public.rewards_nr_settle_v3(p_user,g.id);end if;
 select * into g from public.rewards_nr_games where id=p_game;
 return jsonb_build_object('game',to_jsonb(g)-'user_id','serverNow',clock_timestamp(),'nextAvailableAt',g.started_at+interval '4 hours');
end $$;
create function public.rewards_nr_expire_v3(p_limit integer default 30) returns integer language plpgsql security invoker set search_path='' as $$
declare uid uuid;n integer:=0;begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_request';end if;
 for uid in select u.id from public.rewards_users u where not coalesce(u.banned,false) and exists(select 1 from public.rewards_nr_games g where g.user_id=u.id and g.version=3 and g.status='playing' and g.last_seen<clock_timestamp()-interval '8 seconds') order by u.id limit p_limit for update of u skip locked loop
  perform public.rewards_nr_state(uid);n:=n+1;
 end loop;return n;
end $$;
revoke all on function public.rewards_nr_settle_v3(uuid,uuid),public.rewards_nr_start_v3(uuid,uuid,bigint),public.rewards_nr_step_v3(uuid,uuid,integer,integer[],boolean),public.rewards_nr_expire_v3(integer) from public,anon,authenticated;
grant execute on function public.rewards_nr_settle_v3(uuid,uuid),public.rewards_nr_start_v3(uuid,uuid,bigint),public.rewards_nr_step_v3(uuid,uuid,integer,integer[],boolean),public.rewards_nr_expire_v3(integer) to service_role;
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
create or replace function public.rewards_nr_leaderboard(p_user uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.rewards_users where id=p_user and not coalesce(banned,false)) then raise exception 'user_unavailable'; end if;
 return (with eligible as (
 select g.*,case when g.version in(2,3) then g.distance/40 else g.tick::bigint*2 end as meters
 from public.rewards_nr_games g join public.rewards_users u on u.id=g.user_id
 where g.tick>0 and not coalesce(u.banned,false) and (g.status in ('crashed','stopped','expired') or (g.status='playing' and g.last_seen<now()-interval '8 seconds'))
 ), best as (
 select distinct on (user_id) user_id,meters,tick,started_at,id from eligible order by user_id,meters desc,tick,started_at,id
 ), top_runs as (
 select * from best order by meters desc,tick,started_at,id limit 10
 ), entries as (
 select row_number() over(order by b.meters desc,b.tick,b.started_at,b.id) as rank,u.twitch_login as login,u.twitch_display_name as "displayName",b.meters as "distanceMeters",b.tick as "elapsedTicks",b.user_id=p_user as "isMe"
 from top_runs b join public.rewards_users u on u.id=b.user_id
 ) select jsonb_build_object('entries',coalesce(jsonb_agg(to_jsonb(entries) order by rank),'[]'::jsonb)) from entries);
end $$;
revoke all on function public.rewards_nr_leaderboard(uuid) from public,anon,authenticated;
grant execute on function public.rewards_nr_leaderboard(uuid) to service_role;
