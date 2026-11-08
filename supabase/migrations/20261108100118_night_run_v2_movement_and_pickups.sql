alter table public.rewards_nr_games
 add column version integer not null default 1 check(version in (1,2)),
 add column position integer not null default 1000 check(position between 0 and 2000),
 add column distance bigint not null default 0 check(distance>=0),
 add column coin_index integer not null default 1 check(coin_index>0),
 add column next_coin_tick integer not null default 0,
 add column last_coin_tick integer not null default 0;
comment on column public.rewards_nr_rewards.minute is 'Pickup sequence index (minute index for version 1).';
create function public.rewards_nr_speed(p_tick integer) returns integer language sql immutable security invoker set search_path='' as $$
 select 80+least(60,greatest(0,p_tick-1)/20)
$$;
create function public.rewards_nr_distance(p_tick integer) returns bigint language sql immutable security invoker set search_path='' as $$
 select 20*(80*k+k*(k-1)/2)+(greatest(0,p_tick)::bigint-20*k)*(80+k) from (select least(60,greatest(0,p_tick)/20)::bigint k) t
$$;
create function public.rewards_nr_gap(p_seed bigint,p_index integer) returns integer language sql immutable security invoker set search_path='' as $$
 select (300+public.rewards_nr_hash(p_seed+777,p_index)%151)::integer
$$;
create function public.rewards_nr_blocks_v2(p_seed bigint,p_row integer,p_next integer,p_last integer) returns integer[] language sql immutable security invoker set search_path='' as $$
 select case when p_row<3 or abs(p_row::bigint*1000-public.rewards_nr_distance(p_next))<=700 or (p_last>0 and abs(p_row::bigint*1000-public.rewards_nr_distance(p_last))<=700) then '{}'::integer[]
 when p_row>35 and public.rewards_nr_hash(p_seed,p_row)%5=0 then array[(public.rewards_nr_hash(p_seed,p_row)%3)::integer,((public.rewards_nr_hash(p_seed,p_row)+1)%3)::integer]
 else array[(public.rewards_nr_hash(p_seed,p_row)%3)::integer] end
$$;
create function public.rewards_nr_start_v2(p_user uuid,p_id uuid,p_seed bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games%rowtype;
begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 if p_id is null or p_seed is null or p_seed not between 1 and 2147483646 then raise exception 'invalid_request';end if;
 select * into g from public.rewards_nr_games where id=p_id;
 if found then if g.user_id<>p_user then raise exception 'game_not_found';end if;return public.rewards_nr_state(p_user);end if;
 perform public.rewards_nr_state(p_user);
 select * into g from public.rewards_nr_games where user_id=p_user and status='playing' for update;
 if not found then
  insert into public.rewards_nr_games(id,user_id,seed,version,next_coin_tick) values(p_id,p_user,p_seed,2,public.rewards_nr_gap(p_seed,1)) returning * into g;
 end if;
 return jsonb_build_object('game',to_jsonb(g)-'user_id','serverNow',clock_timestamp());
end $$;
create function public.rewards_nr_step_v2(p_user uuid,p_game uuid,p_from integer,p_inputs integer[],p_stop boolean default false)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games%rowtype;target integer;maximum integer;tx uuid;old_d bigint;old_x integer;new_x integer;v integer;r integer;b integer;crossing bigint;hit boolean;
begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 if p_from is null or p_from<0 or p_inputs is null or cardinality(p_inputs)>30 or (cardinality(p_inputs)=0 and not coalesce(p_stop,false)) or exists(select 1 from unnest(p_inputs) x where x is null or x not between 0 and 2) then raise exception 'invalid_request';end if;
 select * into g from public.rewards_nr_games where id=p_game and user_id=p_user for update;
 if not found or g.version<>2 then raise exception 'game_not_found';end if;
 if p_from>g.tick then raise exception 'stale_game';end if;
 if p_from<g.tick or g.status<>'playing' then return jsonb_build_object('game',to_jsonb(g)-'user_id','serverNow',clock_timestamp());end if;
 maximum=floor(extract(epoch from (clock_timestamp()-g.started_at))*10);
 if g.tick+cardinality(p_inputs)>maximum then raise exception 'too_fast';end if;
 if clock_timestamp()-g.last_seen>interval '8 seconds' or maximum-(g.tick+cardinality(p_inputs))>50 then g.status='expired';
 else
  foreach target in array p_inputs loop
   g.tick=g.tick+1;old_d=g.distance;old_x=g.position;v=public.rewards_nr_speed(g.tick);
   new_x=old_x+sign(target*1000-old_x)::integer*least(abs(target*1000-old_x),500);
   g.distance=g.distance+v;g.position=new_x;g.lane=floor(new_x/1000.0+0.5);
   hit=false;
   for r in (old_d/1000+1)::integer..(g.distance/1000)::integer loop
    crossing=r::bigint*1000-old_d;
    foreach b in array public.rewards_nr_blocks_v2(g.seed,r,g.next_coin_tick,g.last_coin_tick) loop
     if abs((old_x-b*1000)::bigint*v+(new_x-old_x)*crossing)<480*v then
      g.status='crashed';g.distance=r::bigint*1000;g.position=floor(old_x+(new_x-old_x)*crossing::numeric/v+0.5);g.lane=floor(g.position/1000.0+0.5);hit=true;exit;
     end if;
    end loop;
    if hit then exit;end if;
   end loop;
   if hit then exit;end if;
   if g.tick=g.next_coin_tick then
    if abs(g.position-(public.rewards_nr_hash(g.seed+999,g.coin_index)%3)*1000)<=380 then
     insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user,1,'adjustment','NIGHT RUN · монета · '||g.coin_index::text) returning id into tx;
     insert into public.rewards_nr_rewards(game_id,minute,transaction_id) values(g.id,g.coin_index,tx);g.coins=g.coins+1;
    end if;
    g.last_coin_tick=g.next_coin_tick;g.coin_index=g.coin_index+1;g.next_coin_tick=g.next_coin_tick+public.rewards_nr_gap(g.seed,g.coin_index);
   end if;
  end loop;
  if coalesce(p_stop,false) and g.status='playing' then g.status='stopped';end if;
 end if;
 update public.rewards_nr_games set tick=g.tick,lane=g.lane,position=g.position,distance=g.distance,coins=g.coins,status=g.status,coin_index=g.coin_index,next_coin_tick=g.next_coin_tick,last_coin_tick=g.last_coin_tick,last_seen=clock_timestamp() where id=g.id returning * into g;
 return jsonb_build_object('game',to_jsonb(g)-'user_id','serverNow',clock_timestamp());
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
revoke all on function public.rewards_nr_speed(integer),public.rewards_nr_distance(integer),public.rewards_nr_gap(bigint,integer),public.rewards_nr_blocks_v2(bigint,integer,integer,integer),public.rewards_nr_start_v2(uuid,uuid,bigint),public.rewards_nr_step_v2(uuid,uuid,integer,integer[],boolean) from public,anon,authenticated;
grant execute on function public.rewards_nr_speed(integer),public.rewards_nr_distance(integer),public.rewards_nr_gap(bigint,integer),public.rewards_nr_blocks_v2(bigint,integer,integer,integer),public.rewards_nr_start_v2(uuid,uuid,bigint),public.rewards_nr_step_v2(uuid,uuid,integer,integer[],boolean) to service_role;
