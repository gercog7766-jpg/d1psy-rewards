create or replace function public.rewards_s1_seed_daily_schedule()
returns void language plpgsql security invoker set search_path='' as $$
declare d date; k text; h bigint; i integer; j integer; tmp text; a text[]; t text; tv integer; rv integer;
begin
 -- Never rewrite tasks for a day that has already begun.
 d:=greatest(date '2026-11-07',(now() at time zone 'Europe/Moscow')::date+1);
 while d<=date '2026-12-12' loop
  delete from public.rewards_season_daily_schedule where day=d;
  if d=date '2026-11-07' then
   insert into public.rewards_season_daily_schedule(day,task_key,target,reward) values
    (d,'ttt_win',1,150),(d,'wordly_win',1,150),(d,'predict_winner',1,150);
  else
   k:=to_char(d,'YYYY-MM-DD');h:=0;
   for i in 1..length(k) loop h:=mod(h*31+ascii(substr(k,i,1)),4294967296);end loop;
   a:=array['drop_win','daily_bonus','upgrades_2','shop_buy','xp_100','withdraw_30','upgrade_win','ttt_win','wordly_win','predict_winner','checkers_play','black_box_bid','minesweeper_play','defuse_play'];
   if extract(isodow from d)=7 then a:=array_remove(a,'drop_win');end if;
   i:=cardinality(a);
   while i>1 loop h:=mod(h*1664525+1013904223,4294967296);j:=mod(h,i)::integer+1;tmp:=a[i];a[i]:=a[j];a[j]:=tmp;i:=i-1;end loop;
   for i in 1..3 loop
    t:=a[i];tv:=case t when 'upgrades_2' then 2 when 'xp_100' then 100 else 1 end;
    rv:=case t when 'drop_win' then 100 when 'daily_bonus' then 100 when 'upgrade_win' then 200 else 150 end;
    insert into public.rewards_season_daily_schedule(day,task_key,target,reward) values(d,t,tv,rv);
   end loop;
  end if;
  d:=d+1;
 end loop;
end; $$;
revoke all on function public.rewards_s1_seed_daily_schedule() from public,anon,authenticated;
grant execute on function public.rewards_s1_seed_daily_schedule() to service_role;
select public.rewards_s1_seed_daily_schedule();

create index rewards_red_button_holds_user_time_idx on public.rewards_red_button_holds(user_id,started_at);

create function public.rewards_s1_sync_red_hold(p_user uuid,p_at timestamptz default clock_timestamp())
returns void language plpgsql set search_path = '' as $$
declare
  week_start timestamptz := date_trunc('week', p_at at time zone 'Europe/Moscow') at time zone 'Europe/Moscow';
  week_end timestamptz := week_start + interval '7 days';
  period text := 'M'||to_char(week_start at time zone 'Europe/Moscow','YYYY-MM-DD');
  elapsed_minutes integer;
  credited integer;
begin
  if p_at < timestamptz '2026-11-01 21:00:00+00' or p_at >= timestamptz '2026-12-12 21:00:00+00' then return; end if;
  if not exists (select 1 from public.rewards_red_button_holds where user_id=p_user and started_at>=week_start and started_at<week_end)
    then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('night-shift:red-button:'||p_user||':'||period,0));
  select progress into credited from public.rewards_season_task_progress
    where user_id=p_user and season_id='s1' and task_key='red_button_300' and period_key=period;
  if credited>=300 then return; end if;
  select least(300,floor(coalesce(sum(extract(epoch from
    (greatest(h.started_at,least(coalesce(h.ended_at,clock_timestamp()),r.ends_at,week_end))-h.started_at)
  )),0)/60))::integer
  into elapsed_minutes
  from public.rewards_red_button_holds h join public.rewards_red_button_rounds r on r.id=h.round_id
  where h.user_id=p_user and h.started_at>=week_start and h.started_at<week_end;
  if elapsed_minutes>coalesce(credited,0) then
    perform public.rewards_season_add_task_progress(p_user,'red_button_300',elapsed_minutes-coalesce(credited,0),300,1000,period,false);
  end if;
end;
$$;

create function public.rewards_s1_new_game_tasks() returns trigger
language plpgsql set search_path = '' as $$
declare
  today text := public.rewards_s1_day();
  week text := public.rewards_s1_week();
  challenge_start constant timestamptz := '2026-11-15 21:00:00+00';
  elapsed interval;
begin
  case tg_table_name
  when 'rewards_checkers_rooms' then
    if old.status='active' and new.status in ('won','draw') and new.guest_id is not null then
      perform public.rewards_season_add_task_progress(player,'checkers_play',1,1,150,today,true)
      from unnest(array[new.host_id,new.guest_id]) player order by player;
    end if;
  when 'rewards_black_box_bids' then
    perform public.rewards_season_add_task_progress(new.user_id,'black_box_bid',1,1,150,today,true);
  when 'rewards_ms_games' then
    if old.status='playing' and new.status in ('won','lost') then
      perform public.rewards_season_add_task_progress(new.user_id,'minesweeper_play',1,1,150,today,true);
      elapsed := new.finished_at-new.started_at;
      if new.status='won' and elapsed>=interval '0 seconds' then
        if elapsed<interval '25 seconds' then
          perform public.rewards_season_add_task_progress(new.user_id,'minesweeper_under_25',1,1,700,week,false);
        end if;
        if new.difficulty='hard' and new.finished_at>=challenge_start and elapsed<interval '270 seconds' then
          perform public.rewards_season_add_task_progress(new.user_id,'minesweeper_hard_under_270',1,1,1500,'season',false);
        end if;
      end if;
    end if;
  when 'rewards_defuse_games' then
    if old.status='playing' and new.status in ('won','lost') then
      perform public.rewards_season_add_task_progress(new.user_id,'defuse_play',1,1,150,today,true);
      elapsed := new.finished_at-new.started_at;
      if new.status='won' and new.difficulty='swat' and elapsed>=interval '0 seconds' and elapsed<interval '16 seconds' then
        perform public.rewards_season_add_task_progress(new.user_id,'defuse_swat_under_16',1,1,800,week,false);
      end if;
    end if;
  when 'rewards_guess_rounds' then
    if old.status<>'won' and new.status='won' and new.winner_id is not null then
      perform public.rewards_season_add_task_progress(new.winner_id,'guess_word_win',1,1,800,week,false);
    end if;
  when 'rewards_nr_games' then
    if old.status='playing' and new.status in ('stopped','crashed','expired')
      and new.started_at>=challenge_start and new.finished_at>=challenge_start
      and (case when new.version in (2,3,4) then new.distance/40 else new.tick::bigint*2 end)>111111 then
      perform public.rewards_season_add_task_progress(new.user_id,'night_run_over_111111',1,1,2000,'season',false);
    end if;
  when 'rewards_red_button_holds' then
    if old.ended_at is null and new.ended_at is not null then
      -- The interval belongs to the week in which it was held, including a Sunday hold closed at midnight.
      perform public.rewards_s1_sync_red_hold(new.user_id,new.started_at);
    end if;
  end case;
  return new;
end;
$$;

create trigger rewards_s1_checkers_tasks after update of status on public.rewards_checkers_rooms
  for each row when (old.status is distinct from new.status) execute function public.rewards_s1_new_game_tasks();
create trigger rewards_s1_black_box_tasks after insert on public.rewards_black_box_bids
  for each row execute function public.rewards_s1_new_game_tasks();
create trigger rewards_s1_minesweeper_tasks after update of status on public.rewards_ms_games
  for each row when (old.status is distinct from new.status) execute function public.rewards_s1_new_game_tasks();
create trigger rewards_s1_defuse_tasks after update of status on public.rewards_defuse_games
  for each row when (old.status is distinct from new.status) execute function public.rewards_s1_new_game_tasks();
create trigger rewards_s1_guess_tasks after update of status on public.rewards_guess_rounds
  for each row when (old.status is distinct from new.status) execute function public.rewards_s1_new_game_tasks();
create trigger rewards_s1_nr_challenge after update of status on public.rewards_nr_games
  for each row when (old.status is distinct from new.status) execute function public.rewards_s1_new_game_tasks();
create trigger rewards_s1_red_hold after update of ended_at on public.rewards_red_button_holds
  for each row when (old.ended_at is null and new.ended_at is not null) execute function public.rewards_s1_new_game_tasks();

create function public.rewards_s1_new_weekly_vault() returns trigger
language plpgsql set search_path = '' as $$
declare completed timestamptz;
begin
  if new.season_id='s1' and new.completed_at is not null and new.sp_awarded>0
    and (tg_op='INSERT' or old.completed_at is null)
    and new.task_key in ('minesweeper_under_25','defuse_swat_under_16','red_button_300','guess_word_win') then
    completed := least(new.completed_at, ((substring(new.period_key from 2)::date+7)::timestamp at time zone 'Europe/Moscow')-interval '1 microsecond');
    perform public.rewards_vault_enqueue(new.user_id,'mission','s1:'||new.task_key||':'||new.period_key,completed,
      jsonb_build_object('task',new.task_key,'period',new.period_key));
  end if;
  return new;
end;
$$;
create trigger rewards_s1_new_weekly_vault after insert or update on public.rewards_season_task_progress
  for each row execute function public.rewards_s1_new_weekly_vault();

revoke all on function public.rewards_s1_sync_red_hold(uuid,timestamptz),public.rewards_s1_new_game_tasks(),public.rewards_s1_new_weekly_vault()
  from public,anon,authenticated;
grant execute on function public.rewards_s1_sync_red_hold(uuid,timestamptz),public.rewards_s1_new_game_tasks(),public.rewards_s1_new_weekly_vault()
  to service_role;

CREATE OR REPLACE FUNCTION public.rewards_s1_upgrade_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare d text:=public.rewards_s1_day(); w text:=public.rewards_s1_week(); ratio numeric;
begin
  perform public.rewards_season_add_task_progress(new.user_id,'upgrades_2',1,2,150,d,true);
  perform public.rewards_season_add_task_progress(new.user_id,'upgrades_15',1,25,700,w,false);
  if coalesce(new.extra_coins,0)>0 then perform public.rewards_season_add_task_progress(new.user_id,'upgrader_coins_200',new.extra_coins,300,600,w,false); end if;
  if new.result='won' then
    perform public.rewards_season_add_task_progress(new.user_id,'upgrade_win',1,1,200,d,true);
    if new.chance_bps<=3000 then perform public.rewards_season_add_task_progress(new.user_id,'upgrade_30',1,1,1000,w,false); end if;
    if new.target_value_coins>0 then
      ratio:=new.target_value_coins::numeric/greatest(new.source_value_coins+coalesce(new.extra_coins,0),1);
      if ratio>=2 then
        perform public.rewards_season_add_task_progress(new.user_id,'upgrade_x3',1,2,800,w,false);
      else
        update public.rewards_season_task_progress set progress=0,completed_at=null,sp_awarded=0,updated_at=now() where user_id=new.user_id and season_id='s1' and task_key='upgrade_x3' and period_key=w and completed_at is null;
      end if;
      if new.created_at<timestamptz '2026-11-15 21:00:00+00' and ratio>=5 then perform public.rewards_season_add_task_progress(new.user_id,'allin',1,1,1500,'season',false); end if;
    else
      update public.rewards_season_task_progress set progress=0,completed_at=null,sp_awarded=0,updated_at=now() where user_id=new.user_id and season_id='s1' and task_key='upgrade_x3' and period_key=w and completed_at is null;
    end if;
    if new.created_at>=timestamptz '2026-11-15 21:00:00+00' and new.chance_bps<300 then
      perform public.rewards_season_add_task_progress(new.user_id,'upgrade_under_3',1,1,3000,'season',false);
    end if;
    if new.created_at<timestamptz '2026-11-15 21:00:00+00' and new.chance_bps<=1500 then perform public.rewards_season_add_task_progress(new.user_id,'sniper',1,1,2000,'season',false); end if;
    if new.created_at<timestamptz '2026-11-15 21:00:00+00' and new.chance_bps<=1000 then perform public.rewards_season_add_task_progress(new.user_id,'closecall',1,1,3000,'season',false); end if;
    perform public.rewards_season_add_task_progress(new.user_id,'streak_5',1,5,1500,w,false);
  else
    update public.rewards_season_task_progress set progress=0,completed_at=null,sp_awarded=0,updated_at=now() where user_id=new.user_id and season_id='s1' and task_key in ('streak_5','upgrade_x3') and period_key=w and completed_at is null;
  end if;
  return new;
end $function$;

-- Verified results from the current week already count for weekly goals.
-- Season challenges are intentionally not backfilled.
do $$
declare
  lo timestamptz := date_trunc('week', now() at time zone 'Europe/Moscow') at time zone 'Europe/Moscow';
  week text := public.rewards_s1_week();
  row record;
begin
  for row in
    select distinct user_id,'minesweeper_under_25' as task,700 as reward
      from public.rewards_ms_games
      where status='won' and finished_at>=lo and finished_at between started_at and now()
        and finished_at-started_at<interval '25 seconds'
    union
    select distinct user_id,'defuse_swat_under_16',800
      from public.rewards_defuse_games
      where status='won' and difficulty='swat' and finished_at>=lo and finished_at between started_at and now()
        and finished_at-started_at<interval '16 seconds'
    union
    select distinct winner_id,'guess_word_win',800
      from public.rewards_guess_rounds
      where status='won' and winner_id is not null and ended_at between lo and now()
    order by 1,2
  loop
    perform public.rewards_season_add_task_progress(row.user_id,row.task,1,1,row.reward,week,false);
  end loop;
end;
$$;
