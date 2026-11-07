-- BO3 defaults and previously settled rewards remain unchanged.
alter table public.rewards_predict_matches add column best_of integer not null default 3 check(best_of in(3,5)),add column score_reward integer not null default 3 check(score_reward in(3,5));
alter table public.rewards_predict_matches drop constraint rewards_predict_matches_result_score_check;
alter table public.rewards_predict_matches add constraint rewards_predict_matches_result_score_check check(result_score is null or (best_of=3 and result_score in('2:0','2:1')) or (best_of=5 and result_score in('3:0','3:1','3:2')));
alter table public.rewards_predictions drop constraint rewards_predictions_score_check;
alter table public.rewards_predictions add constraint rewards_predictions_score_check check(score in('2:0','2:1','3:0','3:1','3:2'));
alter table public.rewards_predictions drop constraint rewards_predictions_score_coins_check;
alter table public.rewards_predictions add constraint rewards_predictions_score_coins_check check(score_coins in(0,3,5));
create or replace function public.rewards_save_prediction(p_user_id uuid,p_match_id text,p_winner text,p_score text,p_top_player text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.rewards_predict_matches%rowtype; p public.rewards_predictions%rowtype;
begin
  select * into m from public.rewards_predict_matches where id=p_match_id for update;
  if not found then raise exception 'match_not_found'; end if;
  -- Recheck the DB clock after acquiring the lock, including requests queued at cutoff.
  if m.status<>'scheduled' or clock_timestamp()>=m.starts_at-interval '15 minutes' then
    raise exception 'predictions_closed';
  end if;
  if p_winner is null or p_winner not in ('a','b') or p_score is null or ((m.best_of=3 and p_score not in ('2:0','2:1')) or (m.best_of=5 and p_score not in ('3:0','3:1','3:2')))
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
create or replace function public.rewards_settle_predictions(p_match_id text,p_winner text,p_score text,p_top_players text[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  m public.rewards_predict_matches%rowtype; p public.rewards_predictions%rowtype;
  wc integer; sc integer; pc integer; total integer; tx uuid;
  count_predictions integer:=0; total_coins integer:=0;
begin
  select * into m from public.rewards_predict_matches where id=p_match_id for update;
  if not found then raise exception 'match_not_found'; end if;
  if p_winner is null or p_winner not in ('a','b') or p_score is null or ((m.best_of=3 and p_score not in ('2:0','2:1')) or (m.best_of=5 and p_score not in ('3:0','3:1','3:2')))
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
    sc:=case when p.winner=p_winner and p.score=p_score then m.score_reward else 0 end;
    pc:=case when p.top_player=any(p_top_players) then 4 else 0 end;
    total:=wc+sc+pc; tx:=null;
    update public.rewards_predictions set winner_coins=wc,score_coins=sc,player_coins=pc,
      reward_transaction_id=tx,settled_at=clock_timestamp()
      where match_id=p.match_id and user_id=p.user_id;
    count_predictions:=count_predictions+1;total_coins:=total_coins+total;
  end loop;
  update public.rewards_predict_matches set status='settled',result_winner=p_winner,
    result_score=p_score,result_top_players=p_top_players,settled_at=clock_timestamp() where id=p_match_id;
  return jsonb_build_object('ok',true,'already_settled',false,'predictions',count_predictions,'coins',total_coins,'claim_required',true);
end;
$$;

