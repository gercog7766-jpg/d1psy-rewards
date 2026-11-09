create index rewards_game_week_paid_user on public.rewards_game_week_results(user_id,week_start desc) where reward>0 and transaction_id is not null;
-- Read-only private statistics. The application binds p_user to the signed session.
create function public.rewards_player_statistics(p_user uuid,p_page integer default 0) returns jsonb language plpgsql stable security invoker set search_path='' as $$
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
 select jsonb_build_object('distanceMeters',case when version in(2,3,4) then distance/40 else tick::bigint*2 end,'elapsedMs',tick::bigint*100) into nr from public.rewards_nr_games where user_id=p_user and status in('stopped','crashed','expired') and tick>0 order by case when version in(2,3,4) then distance/40 else tick::bigint*2 end desc,tick desc,id limit 1;
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
revoke all on function public.rewards_player_statistics(uuid,integer) from public,anon,authenticated;
grant execute on function public.rewards_player_statistics(uuid,integer) to service_role;
