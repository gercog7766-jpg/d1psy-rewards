-- Preserve earlier automatic credits and require an explicit claim for future results.
alter table public.rewards_predictions add column claimed_at timestamptz;
update public.rewards_predictions set claimed_at=coalesce(settled_at,updated_at) where reward_transaction_id is not null;

create or replace function public.rewards_settle_predictions(p_match_id text,p_winner text,p_score text,p_top_players text[])
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
create function public.rewards_claim_prediction(p_user_id uuid,p_match_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.rewards_predictions; m public.rewards_predict_matches; total integer; tx uuid; claimed timestamptz;
begin
 if not exists(select 1 from public.rewards_users where id=p_user_id and not coalesce(banned,false)) then raise exception 'user_unavailable'; end if;
 select * into m from public.rewards_predict_matches where id=p_match_id;
 if not found then raise exception 'match_not_found'; end if;
 if m.status<>'settled' then raise exception 'result_pending'; end if;
 select * into p from public.rewards_predictions where user_id=p_user_id and match_id=p_match_id for update;
 if not found then raise exception 'prediction_not_found'; end if;
 if p.settled_at is null then raise exception 'result_pending'; end if;
 total:=p.winner_coins+p.score_coins+p.player_coins;
 if total<=0 then raise exception 'no_reward'; end if;
 if p.reward_transaction_id is not null or p.claimed_at is not null then
  return jsonb_build_object('ok',true,'alreadyClaimed',true,'coins',total,'claimedAt',coalesce(p.claimed_at,p.settled_at));
 end if;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
 values(p_user_id,total,'adjustment','Предикт · '||m.team_a||' vs '||m.team_b||' · '||m.id) returning id into tx;
 claimed:=clock_timestamp();
 update public.rewards_predictions set reward_transaction_id=tx,claimed_at=claimed where user_id=p_user_id and match_id=p_match_id;
 return jsonb_build_object('ok',true,'alreadyClaimed',false,'coins',total,'claimedAt',claimed);
end $$;
revoke all on function public.rewards_settle_predictions(text,text,text,text[]),public.rewards_claim_prediction(uuid,text) from public,anon,authenticated;
grant execute on function public.rewards_settle_predictions(text,text,text,text[]),public.rewards_claim_prediction(uuid,text) to service_role;
