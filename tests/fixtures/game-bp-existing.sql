-- Existing production XP/BP routines copied for isolated integration tests.
-- The BP clock is replaceable only in this fixture.
CREATE OR REPLACE FUNCTION public.rewards_award_xp(p_user_id uuid, p_amount integer, p_reason text, p_source_type text, p_source_id text)
 RETURNS TABLE(ok boolean, xp_total integer, level integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_xp integer;
begin
 if p_amount <= 0 or p_source_id is null or length(p_source_id)=0 then raise exception 'invalid_xp_event'; end if;
 insert into rewards_xp_history(user_id,amount,reason,source_type,source_id) values(p_user_id,p_amount,p_reason,p_source_type,p_source_id)
 on conflict(user_id,source_type,source_id) do nothing;
 if not found then select u.xp_total into v_xp from rewards_users u where u.id=p_user_id; return query select false,v_xp,rewards_level_from_xp(v_xp); return; end if;
 update rewards_users as u set xp_total=u.xp_total+p_amount,updated_at=now() where u.id=p_user_id returning u.xp_total into v_xp;
 return query select true,v_xp,rewards_level_from_xp(v_xp);
end $function$;


CREATE OR REPLACE FUNCTION public.rewards_level_from_xp(p_xp integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
 select greatest(1, floor((sqrt(9 + 8 * greatest(p_xp,0)::numeric / 75) - 3) / 2)::integer + 1)
$function$;


CREATE OR REPLACE FUNCTION public.rewards_season_add_task_progress(p_user uuid, p_task text, p_amount integer, p_target integer, p_reward integer, p_period text, p_is_daily boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_progress integer; v_done timestamptz; v_daily_target integer; v_daily_reward integer;
begin
 if public.test_bp_now() < '2026-11-01 21:00:00+00'::timestamptz or public.test_bp_now() >= '2026-12-12 21:00:00+00'::timestamptz then return; end if;
 if p_amount<=0 then return; end if;
 if p_is_daily then
   select target,reward into v_daily_target,v_daily_reward from public.rewards_season_daily_schedule where day=(public.test_bp_now() at time zone 'Europe/Moscow')::date and task_key=p_task;
   if not found or p_period<>public.rewards_s1_day() then return; end if;
   p_target:=v_daily_target; p_reward:=v_daily_reward;
 end if;
 insert into public.rewards_season_task_progress(user_id,season_id,task_key,period_key,progress,sp_awarded) values(p_user,'s1',p_task,p_period,p_amount,0)
 on conflict(user_id,season_id,task_key,period_key) do update set progress=case when rewards_season_task_progress.completed_at is null then rewards_season_task_progress.progress+excluded.progress else rewards_season_task_progress.progress end,updated_at=public.test_bp_now();
 select progress,completed_at into v_progress,v_done from public.rewards_season_task_progress where user_id=p_user and season_id='s1' and task_key=p_task and period_key=p_period for update;
 if v_done is null and v_progress>=p_target then
   update public.rewards_season_task_progress set progress=p_target,completed_at=public.test_bp_now(),sp_awarded=p_reward,updated_at=public.test_bp_now() where user_id=p_user and season_id='s1' and task_key=p_task and period_key=p_period;
   insert into public.rewards_season_progress(user_id,season_id,sp,claimed_levels) values(p_user,'s1',p_reward,'{}'::integer[])
   on conflict(user_id,season_id) do update set sp=rewards_season_progress.sp+excluded.sp,updated_at=public.test_bp_now();
 end if;
end $function$;

