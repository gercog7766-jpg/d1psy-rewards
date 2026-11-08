create table public.rewards_nr_games(
 id uuid primary key,user_id uuid not null references public.rewards_users(id) on delete cascade,
 seed bigint not null check(seed between 1 and 2147483646),tick integer not null default 0 check(tick>=0),
 lane integer not null default 1 check(lane between 0 and 2),coins integer not null default 0 check(coins>=0),
 status text not null default 'playing' check(status in ('playing','crashed','stopped','expired')),
 started_at timestamptz not null default clock_timestamp(),last_seen timestamptz not null default clock_timestamp()
);
create unique index rewards_nr_one_active on public.rewards_nr_games(user_id) where status='playing';
create index rewards_nr_history on public.rewards_nr_games(user_id,started_at desc);
create table public.rewards_nr_rewards(
 game_id uuid not null references public.rewards_nr_games(id) on delete cascade,
 minute integer not null check(minute>0),transaction_id uuid not null unique references public.rewards_coin_transactions(id),
 primary key(game_id,minute)
);
alter table public.rewards_nr_games enable row level security;
alter table public.rewards_nr_rewards enable row level security;
revoke all on public.rewards_nr_games,public.rewards_nr_rewards from public,anon,authenticated;
grant select,insert,update on public.rewards_nr_games to service_role;
grant select,insert on public.rewards_nr_rewards to service_role;

create function public.rewards_nr_hash(p_seed bigint,p_row integer) returns bigint language sql immutable security invoker set search_path='' as $$
 select (((p_seed+p_row::bigint*48271)%2147483647)*16807)%2147483647
$$;
create function public.rewards_nr_blocks(p_seed bigint,p_row integer) returns integer[] language sql immutable security invoker set search_path='' as $$
 select case when p_row<3 or p_row%50=0 then '{}'::integer[]
 when p_row>35 and public.rewards_nr_hash(p_seed,p_row)%5=0
 then array[(public.rewards_nr_hash(p_seed,p_row)%3)::integer,((public.rewards_nr_hash(p_seed,p_row)+1)%3)::integer]
 else array[(public.rewards_nr_hash(p_seed,p_row)%3)::integer] end
$$;
create function public.rewards_nr_state(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games%rowtype;
begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 select * into g from public.rewards_nr_games where user_id=p_user order by started_at desc limit 1 for update;
 if found and g.status='playing' and clock_timestamp()-g.last_seen>interval '8 seconds' then
  update public.rewards_nr_games set status='expired' where id=g.id returning * into g;
 end if;
 return jsonb_build_object('game',case when g.id is null then null else to_jsonb(g)-'user_id' end,'serverNow',clock_timestamp());
end $$;
create function public.rewards_nr_start(p_user uuid,p_id uuid,p_seed bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games%rowtype;
begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 if p_id is null or p_seed is null or p_seed not between 1 and 2147483646 then raise exception 'invalid_request';end if;
 select * into g from public.rewards_nr_games where id=p_id;
 if found then
  if g.user_id<>p_user then raise exception 'game_not_found';end if;
  return public.rewards_nr_state(p_user);
 end if;
 perform public.rewards_nr_state(p_user);
 select * into g from public.rewards_nr_games where user_id=p_user and status='playing' for update;
 if not found then
  insert into public.rewards_nr_games(id,user_id,seed) values(p_id,p_user,p_seed) returning * into g;
 end if;
 return jsonb_build_object('game',to_jsonb(g)-'user_id','serverNow',clock_timestamp());
end $$;
create function public.rewards_nr_step(p_user uuid,p_game uuid,p_from integer,p_inputs integer[],p_stop boolean default false)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_nr_games%rowtype;target integer;t integer;maximum integer;tx uuid;
begin
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 if p_from is null or p_from<0 or p_inputs is null or cardinality(p_inputs)>30 or
 (cardinality(p_inputs)=0 and not coalesce(p_stop,false)) or exists(select 1 from unnest(p_inputs) x where x is null or x not between 0 and 2) then raise exception 'invalid_request';end if;
 select * into g from public.rewards_nr_games where id=p_game and user_id=p_user for update;
 if not found then raise exception 'game_not_found';end if;
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
revoke all on function public.rewards_nr_hash(bigint,integer),public.rewards_nr_blocks(bigint,integer),public.rewards_nr_state(uuid),public.rewards_nr_start(uuid,uuid,bigint),public.rewards_nr_step(uuid,uuid,integer,integer[],boolean) from public,anon,authenticated;
grant execute on function public.rewards_nr_hash(bigint,integer),public.rewards_nr_blocks(bigint,integer),public.rewards_nr_state(uuid),public.rewards_nr_start(uuid,uuid,bigint),public.rewards_nr_step(uuid,uuid,integer,integer[],boolean) to service_role;
