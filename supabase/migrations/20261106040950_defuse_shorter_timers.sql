-- Only new attempts use the shorter timer. Existing deadlines are unchanged.
create or replace function public.rewards_defuse_start(p_user uuid,p_id uuid,p_difficulty text,p_puzzles jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.rewards_defuse_games; duration integer; t timestamptz;
begin
 if p_id is null or p_difficulty not in('rookie','swat','expert') or p_difficulty is null or jsonb_typeof(p_puzzles)<>'array' or jsonb_array_length(p_puzzles)<>3 then raise exception 'invalid_request'; end if;
 if not exists(select 1 from public.rewards_users where id=p_user and not coalesce(banned,false)) then raise exception 'user_unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended('defuse:'||p_user::text,0));
 select * into g from public.rewards_defuse_games where id=p_id;
 if found then
  if g.user_id<>p_user or g.difficulty<>p_difficulty then raise exception 'invalid_request'; end if;
  return public.rewards_defuse_state(p_user);
 end if;
 select * into g from public.rewards_defuse_games where user_id=p_user order by started_at desc limit 1 for update;
 t:=clock_timestamp();
 if g.id is not null and g.next_available_at>t then return public.rewards_defuse_state(p_user); end if;
 update public.rewards_defuse_games set status='lost',finished_at=t where user_id=p_user and status='playing';
 duration:=case p_difficulty when 'rookie' then 45 when 'swat' then 35 else 25 end;
 insert into public.rewards_defuse_games(id,user_id,difficulty,started_at,deadline,next_available_at,stage_started_at,ready_at,puzzles)
 values(p_id,p_user,p_difficulty,t,t+duration*interval '1 second',t+interval '4 hours',t,t+interval '3 seconds',p_puzzles);
 return public.rewards_defuse_state(p_user);
end $$;

revoke all on function public.rewards_defuse_start(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_defuse_start(uuid,uuid,text,jsonb) to service_role;
