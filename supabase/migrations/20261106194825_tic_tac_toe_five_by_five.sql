-- Retain all existing 3x3 games and extend the same free-game lifecycle to 5x5.
alter table public.rewards_ttt_rooms add column board_size integer not null default 3 check(board_size in(3,5));
alter table public.rewards_ttt_rooms drop constraint rewards_ttt_rooms_board_check;
alter table public.rewards_ttt_rooms add constraint rewards_ttt_rooms_board_check check(array_ndims(board)=1 and array_lower(board,1)=1 and cardinality(board)=board_size*board_size and array_position(board,null) is null and board <@ array['','X','O']::text[]);
CREATE OR REPLACE FUNCTION public.rewards_ttt_create(p_user uuid, p_room uuid, p_password_hash text, p_board_size integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare nick text; own_id uuid;
begin
 if p_board_size is null or p_board_size not in(3,5) then raise exception 'invalid_board_size';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ttt:'||p_user::text,0));
 select coalesce(twitch_display_name,twitch_login,'Игрок') into nick from public.rewards_users where id=p_user;
 if not found then raise exception 'user_not_found'; end if;
 if exists(select 1 from public.rewards_ttt_rooms where id=p_room and host_id=p_user) then
  if exists(select 1 from public.rewards_ttt_rooms where id=p_room and board_size<>p_board_size) then raise exception 'invalid_board_size';end if;
  return jsonb_build_object('ok',true,'roomId',p_room); end if;
 select id into own_id from public.rewards_ttt_rooms where p_user in(host_id,guest_id) and status in('waiting','active') order by created_at desc limit 1;
 if own_id is not null then perform public.rewards_ttt_sync(own_id); end if;
 if exists(select 1 from public.rewards_ttt_rooms where p_user in(host_id,guest_id) and status in('waiting','active')) then raise exception 'already_in_room'; end if;
 insert into public.rewards_ttt_rooms(id,host_id,host_name,password_hash,board_size,board) values(p_room,p_user,nick,p_password_hash,p_board_size,array_fill(''::text,array[p_board_size*p_board_size]));
 return jsonb_build_object('ok',true,'roomId',p_room);
end; $function$;

-- Preserve the three-argument RPC for old clients and in-flight deploys.
create or replace function public.rewards_ttt_create(p_user uuid,p_room uuid,p_password_hash text default null) returns jsonb language sql security invoker set search_path='' as $$
 select public.rewards_ttt_create(p_user,p_room,p_password_hash,3);
$$;
CREATE OR REPLACE FUNCTION public.rewards_ttt_json(r rewards_ttt_rooms, p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select jsonb_build_object('id',r.id,'hostName',r.host_name,'guestName',case when r.password_hash is null or p_user in(r.host_id,r.guest_id) then r.guest_name end,
 'boardSize',r.board_size,'winLength',r.board_size,'isPrivate',r.password_hash is not null,'status',r.status,'expiresAt',r.expires_at,'revision',r.revision,
 'participant',coalesce(p_user in(r.host_id,r.guest_id),false),
 'opponentName',case when p_user=r.host_id then r.guest_name when p_user=r.guest_id then r.host_name end,
 'myMark',case when p_user in(r.host_id,r.guest_id) and r.x_user is not null then case when p_user=r.x_user then 'X' else 'O' end end,
 'board',case when r.password_hash is null or p_user in(r.host_id,r.guest_id) then to_jsonb(r.board) end,
 'turn',r.turn,'deadline',r.turn_deadline,'reason',r.finish_reason,'won',coalesce(r.winner_id=p_user,false),
 'winnerName',case when r.winner_id=r.host_id then r.host_name when r.winner_id=r.guest_id then r.guest_name end);
$function$;

CREATE OR REPLACE FUNCTION public.rewards_ttt_move(p_user uuid, p_room uuid, p_cell integer, p_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.rewards_ttt_rooms%rowtype; mark text; direction integer[]; sign integer; rr integer; cc integer; row_no integer; col_no integer; run integer; winner uuid; reason text;
begin
 select * into r from public.rewards_ttt_rooms where id=p_room for update;
 if not found then raise exception 'room_not_found'; end if;
 if not coalesce(p_user in(r.host_id,r.guest_id),false) then raise exception 'not_participant'; end if;
 if r.status<>'active' or r.turn_deadline<=clock_timestamp() then raise exception 'game_finished'; end if;
 if p_revision is null or p_revision<>r.revision then raise exception 'stale_move'; end if;
 mark:=case when p_user=r.x_user then 'X' else 'O' end;
 if r.turn<>mark then raise exception 'not_your_turn'; end if;
 if p_cell is null or p_cell<0 or p_cell>=r.board_size*r.board_size or r.board[p_cell+1]<>'' then raise exception 'invalid_cell'; end if;
 r.board[p_cell+1]:=mark;

 row_no:=p_cell/r.board_size;col_no:=p_cell%r.board_size;
 foreach direction slice 1 in array array[[1,0],[0,1],[1,1],[1,-1]] loop
  run:=1;
  foreach sign in array array[-1,1] loop
   rr:=row_no+direction[1]*sign;cc:=col_no+direction[2]*sign;
   while rr>=0 and rr<r.board_size and cc>=0 and cc<r.board_size loop
    exit when r.board[rr*r.board_size+cc+1]<>mark;
    run:=run+1;rr:=rr+direction[1]*sign;cc:=cc+direction[2]*sign;
   end loop;
  end loop;
  if run>=r.board_size then winner:=p_user;reason:='line';exit;end if;
 end loop;
 if winner is null and not(''=any(r.board)) then reason:='draw';end if;
 update public.rewards_ttt_rooms set board=r.board,status=case when reason is null then 'active' else 'finished' end,
 winner_id=winner,finish_reason=reason,turn=case when mark='X' then 'O' else 'X' end,
 turn_deadline=clock_timestamp()+interval '60 seconds',revision=revision+1,updated_at=clock_timestamp() where id=p_room;
 return jsonb_build_object('ok',true,'roomId',p_room);
end; $function$;

revoke all on function public.rewards_ttt_create(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.rewards_ttt_create(uuid,uuid,text,integer) to service_role;

