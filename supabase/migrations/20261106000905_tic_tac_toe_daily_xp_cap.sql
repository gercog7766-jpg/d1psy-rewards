-- Cap only tic-tac-toe level XP at 30 per Moscow day. BP remains independent.
create or replace function public.rewards_game_progress_trigger()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_xp_today integer; v_start timestamptz;
begin
 if tg_table_name='rewards_ttt_rooms' then
  if new.status='finished' and old.status<>'finished' and new.winner_id is not null and new.guest_id is not null then
   -- Serialize the quota across simultaneous room completions for this account.
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ttt-xp:'||new.winner_id::text,0));
   v_start:=(now() at time zone 'Europe/Moscow')::date::timestamp at time zone 'Europe/Moscow';
   select coalesce(sum(amount),0) into v_xp_today from public.rewards_xp_history
    where user_id=new.winner_id and source_type='tic_tac_toe_win'
      and created_at>=v_start and created_at<v_start+interval '24 hours';
   if v_xp_today<30 then
    perform * from public.rewards_award_xp(new.winner_id,least(10,30-v_xp_today),'Победа в крестиках-ноликах','tic_tac_toe_win',new.id::text);
   end if;
   perform public.rewards_season_add_task_progress(new.winner_id,'ttt_win',1,1,150,public.rewards_s1_day(),true);
  end if;
 elsif tg_table_name='rewards_wordly_games' then
  if new.answer=any(new.guesses) and not(new.answer=any(old.guesses)) then
   perform public.rewards_season_add_task_progress(new.user_id,'wordly_win',1,1,150,public.rewards_s1_day(),true);
  end if;
 elsif tg_table_name='rewards_predictions' then
  if new.settled_at is not null and old.settled_at is null and new.winner_coins=3 then
   perform public.rewards_season_add_task_progress(new.user_id,'predict_winner',1,1,150,public.rewards_s1_day(),true);
  end if;
 end if;
 return new;
end; $$;
revoke all on function public.rewards_game_progress_trigger() from public,anon,authenticated;
grant execute on function public.rewards_game_progress_trigger() to service_role;
