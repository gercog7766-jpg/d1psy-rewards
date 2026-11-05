-- Level XP starts immediately. New daily BP tasks start on 2026-11-07 MSK.
-- Retain the one-current-room guard without locking the account XP row first.
create or replace function public.rewards_ttt_create(p_user uuid,p_room uuid,p_password_hash text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare nick text; own_id uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ttt:'||p_user::text,0));
 select coalesce(twitch_display_name,twitch_login,'Игрок') into nick from public.rewards_users where id=p_user;
 if not found then raise exception 'user_not_found'; end if;
 if exists(select 1 from public.rewards_ttt_rooms where id=p_room and host_id=p_user) then return jsonb_build_object('ok',true,'roomId',p_room); end if;
 select id into own_id from public.rewards_ttt_rooms where p_user in(host_id,guest_id) and status in('waiting','active') order by created_at desc limit 1;
 if own_id is not null then perform public.rewards_ttt_sync(own_id); end if;
 if exists(select 1 from public.rewards_ttt_rooms where p_user in(host_id,guest_id) and status in('waiting','active')) then raise exception 'already_in_room'; end if;
 insert into public.rewards_ttt_rooms(id,host_id,host_name,password_hash) values(p_room,p_user,nick,p_password_hash);
 return jsonb_build_object('ok',true,'roomId',p_room);
end; $$;

create or replace function public.rewards_ttt_join(p_user uuid,p_room uuid,p_password_hash text,p_host_x boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare nick text; r public.rewards_ttt_rooms%rowtype;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ttt:'||p_user::text,0));
 select coalesce(twitch_display_name,twitch_login,'Игрок') into nick from public.rewards_users where id=p_user;
 if not found then raise exception 'user_not_found'; end if;
 if exists(select 1 from public.rewards_ttt_rooms where id<>p_room and p_user in(host_id,guest_id) and status in('waiting','active')) then raise exception 'already_in_room'; end if;
 select * into r from public.rewards_ttt_rooms where id=p_room for update;
 if not found then raise exception 'room_not_found'; end if;
 if p_user in(r.host_id,r.guest_id) then return jsonb_build_object('ok',true,'roomId',p_room); end if;
 if r.status<>'waiting' or r.expires_at<=clock_timestamp() then raise exception 'room_closed'; end if;
 if r.password_hash is not null and (p_password_hash is null or r.password_hash<>p_password_hash) then raise exception 'wrong_password'; end if;
 update public.rewards_ttt_rooms set guest_id=p_user,guest_name=nick,status='active',x_user=case when p_host_x then host_id else p_user end,
 turn_deadline=clock_timestamp()+interval '60 seconds',revision=revision+1,updated_at=clock_timestamp() where id=p_room;
 return jsonb_build_object('ok',true,'roomId',p_room);
end; $$;


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
   a:=array['drop_win','daily_bonus','upgrades_2','shop_buy','xp_100','withdraw_30','upgrade_win','ttt_win','wordly_win','predict_winner'];
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

create function public.rewards_game_progress_trigger()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='rewards_ttt_rooms' then
  if new.status='finished' and old.status<>'finished' and new.winner_id is not null and new.guest_id is not null then
   perform * from public.rewards_award_xp(new.winner_id,10,'Победа в крестиках-ноликах','tic_tac_toe_win',new.id::text);
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
create trigger rewards_ttt_level_bp after update on public.rewards_ttt_rooms for each row execute function public.rewards_game_progress_trigger();
create trigger rewards_wordly_bp after update on public.rewards_wordly_games for each row execute function public.rewards_game_progress_trigger();
create trigger rewards_predict_bp after update on public.rewards_predictions for each row execute function public.rewards_game_progress_trigger();
