create or replace function public.rewards_nr_step_v3(p_user uuid,p_game uuid,p_from integer,p_inputs integer[],p_stop boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
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
        loss:=least(5+2*g.hits,g.coins);g.coins:=g.coins-loss;g.lost_coins:=g.lost_coins+loss;g.hits:=g.hits+1;g.last_hit_tick:=g.tick;g.invulnerable_until_tick:=g.tick+10;hit:=true;
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
