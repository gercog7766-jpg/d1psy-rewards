-- Replace only the unavailable prediction mission for the current Moscow game day.
-- Keep its 150 SP reward; completed historical missions and other days are untouched.
update public.rewards_season_daily_schedule set task_key='wordly_win',target=1
where day='2026-11-09' and task_key='predict_winner'
and not exists(select 1 from public.rewards_season_daily_schedule where day='2026-11-09' and task_key='wordly_win');
-- Count genuine Wordle wins already made earlier that same day, without duplicate SP.
do $$declare player record;begin
 if (clock_timestamp() at time zone 'Europe/Moscow')::date='2026-11-09' then
  for player in select g.user_id from public.rewards_wordly_games g join public.rewards_users u on u.id=g.user_id where g.game_day='2026-11-09' and g.answer=any(g.guesses) and not coalesce(u.banned,false) and not exists(select 1 from public.rewards_season_task_progress p where p.user_id=g.user_id and p.season_id='s1' and p.task_key='wordly_win' and p.period_key='2026-11-09' and p.completed_at is not null) loop
   perform public.rewards_season_add_task_progress(player.user_id,'wordly_win',1,1,150,'2026-11-09',true);
  end loop;
 end if;
end$$;
