-- Standalone BO3 predictions. Application server authorizes signed Twitch sessions.
create table public.rewards_predict_matches (
  id text primary key check (id ~ '^[a-z0-9-]{1,80}$'),
  tournament text not null default 'CS2',
  starts_at timestamptz not null,
  team_a text not null,
  team_b text not null,
  logo_a text not null,
  logo_b text not null,
  roster_a text[] not null check (cardinality(roster_a)=5),
  roster_b text[] not null check (cardinality(roster_b)=5),
  status text not null default 'scheduled' check (status in ('scheduled','settled','cancelled')),
  result_winner text check (result_winner in ('a','b')),
  result_score text check (result_score in ('2:0','2:1')),
  result_top_players text[],
  settled_at timestamptz,
  check (status <> 'settled' or (result_winner is not null and result_score is not null and result_top_players is not null and cardinality(result_top_players)>0 and settled_at is not null))
);
create index rewards_predict_matches_start_idx on public.rewards_predict_matches(starts_at);
create table public.rewards_predictions (
  match_id text not null references public.rewards_predict_matches(id),
  user_id uuid not null references public.rewards_users(id),
  winner text not null check (winner in ('a','b')),
  score text not null check (score in ('2:0','2:1')),
  top_player text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  winner_coins integer not null default 0 check (winner_coins in (0,3)),
  score_coins integer not null default 0 check (score_coins in (0,3)),
  player_coins integer not null default 0 check (player_coins in (0,4)),
  reward_transaction_id uuid unique references public.rewards_coin_transactions(id),
  settled_at timestamptz,
  primary key(match_id,user_id)
);
create index rewards_predictions_user_idx on public.rewards_predictions(user_id);
alter table public.rewards_predict_matches enable row level security;
alter table public.rewards_predictions enable row level security;
revoke all on public.rewards_predict_matches, public.rewards_predictions from public, anon, authenticated;
grant select, insert, update on public.rewards_predict_matches, public.rewards_predictions to service_role;

create function public.rewards_save_prediction(p_user_id uuid,p_match_id text,p_winner text,p_score text,p_top_player text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.rewards_predict_matches%rowtype; p public.rewards_predictions%rowtype;
begin
  select * into m from public.rewards_predict_matches where id=p_match_id for update;
  if not found then raise exception 'match_not_found'; end if;
  -- Recheck the DB clock after acquiring the lock, including requests queued at cutoff.
  if m.status<>'scheduled' or clock_timestamp()>=m.starts_at-interval '15 minutes' then
    raise exception 'predictions_closed';
  end if;
  if p_winner is null or p_winner not in ('a','b') or p_score is null or p_score not in ('2:0','2:1')
    or p_top_player is null or not (p_top_player=any(m.roster_a||m.roster_b)) then
    raise exception 'invalid_prediction';
  end if;
  insert into public.rewards_predictions(match_id,user_id,winner,score,top_player)
    values(p_match_id,p_user_id,p_winner,p_score,p_top_player)
    on conflict(match_id,user_id) do update set winner=excluded.winner,score=excluded.score,
      top_player=excluded.top_player,updated_at=clock_timestamp()
    returning * into p;
  return to_jsonb(p);
end;
$$;

create function public.rewards_settle_predictions(p_match_id text,p_winner text,p_score text,p_top_players text[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  m public.rewards_predict_matches%rowtype; p public.rewards_predictions%rowtype;
  wc integer; sc integer; pc integer; total integer; tx uuid;
  count_predictions integer:=0; total_coins integer:=0;
begin
  select * into m from public.rewards_predict_matches where id=p_match_id for update;
  if not found then raise exception 'match_not_found'; end if;
  if p_winner is null or p_winner not in ('a','b') or p_score is null or p_score not in ('2:0','2:1')
    or p_top_players is null or cardinality(p_top_players)=0 or array_position(p_top_players,null) is not null
    or not(p_top_players<@(m.roster_a||m.roster_b)) then raise exception 'invalid_result'; end if;
  if m.status='settled' then
    if m.result_winner<>p_winner or m.result_score<>p_score or not(m.result_top_players@>p_top_players and m.result_top_players<@p_top_players) then
      raise exception 'result_already_set';
    end if;
    return jsonb_build_object('ok',true,'already_settled',true);
  end if;
  if m.status<>'scheduled' or clock_timestamp()<m.starts_at then raise exception 'match_not_finished'; end if;
  for p in select * from public.rewards_predictions where match_id=p_match_id order by user_id for update loop
    wc:=case when p.winner=p_winner then 3 else 0 end;
    -- Exact score means the actual match result, including the winning team.
    sc:=case when p.winner=p_winner and p.score=p_score then 3 else 0 end;
    pc:=case when p.top_player=any(p_top_players) then 4 else 0 end;
    total:=wc+sc+pc; tx:=null;
    if total>0 then
      insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
        values(p.user_id,total,'adjustment','Предикт · '||m.team_a||' vs '||m.team_b||' · '||m.id)
        returning id into tx;
    end if;
    update public.rewards_predictions set winner_coins=wc,score_coins=sc,player_coins=pc,
      reward_transaction_id=tx,settled_at=clock_timestamp()
      where match_id=p.match_id and user_id=p.user_id;
    count_predictions:=count_predictions+1;total_coins:=total_coins+total;
  end loop;
  update public.rewards_predict_matches set status='settled',result_winner=p_winner,
    result_score=p_score,result_top_players=p_top_players,settled_at=clock_timestamp() where id=p_match_id;
  return jsonb_build_object('ok',true,'already_settled',false,'predictions',count_predictions,'coins',total_coins);
end;
$$;
revoke all on function public.rewards_save_prediction(uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.rewards_settle_predictions(text,text,text,text[]) from public, anon, authenticated;
grant execute on function public.rewards_save_prediction(uuid,text,text,text,text) to service_role;
grant execute on function public.rewards_settle_predictions(text,text,text,text[]) to service_role;

insert into public.rewards_predict_matches(id,starts_at,team_a,team_b,logo_a,logo_b,roster_a,roster_b) values
('2026-11-06-parivision-navi','2026-11-06 06:30:00+00','PARIVISION','Natus Vincere',
 '/predict-assets/parivision.png',
 '/predict-assets/navi.png',
 array['HObbit','FL1T','Jame','xiELO','zweih'],array['Aleksib','iM','b1t','w0nderful','makazze']),
('2026-11-06-betboom-furia','2026-11-06 09:30:00+00','BETBOOM','FURIA',
 '/predict-assets/betboom.png','/predict-assets/furia.png',
 array['Boombl4','zorte','S1ren','d1Ledez','Magnojez'],array['FalleN','yuurih','YEKINDAR','KSCERATO','molodoy']);
