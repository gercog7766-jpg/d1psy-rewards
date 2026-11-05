-- Free multiplayer game. No coin transactions or economy integration.
create table public.rewards_ttt_rooms (
 id uuid primary key,
 host_id uuid not null references public.rewards_users(id),
 guest_id uuid references public.rewards_users(id),
 host_name text not null, guest_name text,
 password_hash text check(password_hash is null or password_hash ~ '^[0-9a-f]{64}$'),
 status text not null default 'waiting' check(status in ('waiting','active','finished','cancelled')),
 board text[] not null default array['','','','','','','','',''] check(cardinality(board)=9 and board<@array['','X','O']::text[]),
 x_user uuid references public.rewards_users(id),
 turn text not null default 'X' check(turn in ('X','O')),
 winner_id uuid references public.rewards_users(id),
 finish_reason text check(finish_reason in ('line','draw','timeout','resigned','cancelled','expired')),
 revision integer not null default 0,
 turn_deadline timestamptz,
 expires_at timestamptz not null default (clock_timestamp()+interval '15 minutes'),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 check(guest_id is null or guest_id<>host_id)
);
create index rewards_ttt_host_idx on public.rewards_ttt_rooms(host_id,created_at desc);
create index rewards_ttt_guest_idx on public.rewards_ttt_rooms(guest_id,created_at desc) where guest_id is not null;
create index rewards_ttt_lobby_idx on public.rewards_ttt_rooms(created_at desc) where status='waiting' and password_hash is null;
alter table public.rewards_ttt_rooms enable row level security;
revoke all on public.rewards_ttt_rooms from public,anon,authenticated;
grant select,insert,update on public.rewards_ttt_rooms to service_role;

create function public.rewards_ttt_sync(p_room uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.rewards_ttt_rooms set status='cancelled',finish_reason='expired',revision=revision+1,updated_at=clock_timestamp()
 where id=p_room and status='waiting' and expires_at<=clock_timestamp();
 update public.rewards_ttt_rooms set status='finished',finish_reason='timeout',
 winner_id=case when (turn='X') then case when x_user=host_id then guest_id else host_id end else x_user end,
 revision=revision+1,updated_at=clock_timestamp()
 where id=p_room and status='active' and turn_deadline<=clock_timestamp();
end; $$;

create function public.rewards_ttt_json(r public.rewards_ttt_rooms,p_user uuid) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'hostName',r.host_name,'guestName',case when r.password_hash is null or p_user in(r.host_id,r.guest_id) then r.guest_name end,
 'isPrivate',r.password_hash is not null,'status',r.status,'expiresAt',r.expires_at,'revision',r.revision,
 'participant',coalesce(p_user in(r.host_id,r.guest_id),false),
 'opponentName',case when p_user=r.host_id then r.guest_name when p_user=r.guest_id then r.host_name end,
 'myMark',case when p_user in(r.host_id,r.guest_id) and r.x_user is not null then case when p_user=r.x_user then 'X' else 'O' end end,
 'board',case when r.password_hash is null or p_user in(r.host_id,r.guest_id) then to_jsonb(r.board) end,
 'turn',r.turn,'deadline',r.turn_deadline,'reason',r.finish_reason,'won',coalesce(r.winner_id=p_user,false),
 'winnerName',case when r.winner_id=r.host_id then r.host_name when r.winner_id=r.guest_id then r.guest_name end);
$$;

create function public.rewards_ttt_state(p_user uuid,p_room uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare own_id uuid; chosen uuid; r public.rewards_ttt_rooms%rowtype; room_json jsonb; lobby jsonb; history jsonb;
begin
 select id into own_id from public.rewards_ttt_rooms where p_user in(host_id,guest_id) and status in('waiting','active') order by created_at desc limit 1;
 if own_id is not null then perform public.rewards_ttt_sync(own_id); end if;
 chosen:=coalesce(p_room,own_id);
 if chosen is not null then
  perform public.rewards_ttt_sync(chosen);
  select * into r from public.rewards_ttt_rooms where id=chosen;
  if found then room_json:=public.rewards_ttt_json(r,p_user); end if;
 end if;
 select coalesce(jsonb_agg(public.rewards_ttt_json(t,p_user)),'[]') into lobby from
 (select * from public.rewards_ttt_rooms where status='waiting' and password_hash is null and expires_at>clock_timestamp() order by created_at desc limit 40)t;
 select coalesce(jsonb_agg(public.rewards_ttt_json(t,p_user)),'[]') into history from
 (select * from public.rewards_ttt_rooms where p_user in(host_id,guest_id) and status in('finished','cancelled') order by updated_at desc limit 10)t;
 select id into own_id from public.rewards_ttt_rooms where p_user in(host_id,guest_id) and status in('waiting','active') order by created_at desc limit 1;
 return jsonb_build_object('serverNow',clock_timestamp(),'room',room_json,'currentRoomId',own_id,'rooms',lobby,'history',history);
end; $$;

create function public.rewards_ttt_create(p_user uuid,p_room uuid,p_password_hash text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare nick text; own_id uuid;
begin
 select coalesce(twitch_display_name,twitch_login,'Игрок') into nick from public.rewards_users where id=p_user for update;
 if not found then raise exception 'user_not_found'; end if;
 if exists(select 1 from public.rewards_ttt_rooms where id=p_room and host_id=p_user) then return jsonb_build_object('ok',true,'roomId',p_room); end if;
 select id into own_id from public.rewards_ttt_rooms where p_user in(host_id,guest_id) and status in('waiting','active') order by created_at desc limit 1;
 if own_id is not null then perform public.rewards_ttt_sync(own_id); end if;
 if exists(select 1 from public.rewards_ttt_rooms where p_user in(host_id,guest_id) and status in('waiting','active')) then raise exception 'already_in_room'; end if;
 insert into public.rewards_ttt_rooms(id,host_id,host_name,password_hash) values(p_room,p_user,nick,p_password_hash);
 return jsonb_build_object('ok',true,'roomId',p_room);
end; $$;

create function public.rewards_ttt_join(p_user uuid,p_room uuid,p_password_hash text,p_host_x boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare nick text; r public.rewards_ttt_rooms%rowtype;
begin
 select coalesce(twitch_display_name,twitch_login,'Игрок') into nick from public.rewards_users where id=p_user for update;
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

create function public.rewards_ttt_move(p_user uuid,p_room uuid,p_cell integer,p_revision integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.rewards_ttt_rooms%rowtype; mark text; line integer[]; winner uuid; reason text;
begin
 select * into r from public.rewards_ttt_rooms where id=p_room for update;
 if not found then raise exception 'room_not_found'; end if;
 if not coalesce(p_user in(r.host_id,r.guest_id),false) then raise exception 'not_participant'; end if;
 if r.status<>'active' or r.turn_deadline<=clock_timestamp() then raise exception 'game_finished'; end if;
 if p_revision is null or p_revision<>r.revision then raise exception 'stale_move'; end if;
 mark:=case when p_user=r.x_user then 'X' else 'O' end;
 if r.turn<>mark then raise exception 'not_your_turn'; end if;
 if p_cell is null or p_cell<0 or p_cell>8 or r.board[p_cell+1]<>'' then raise exception 'invalid_cell'; end if;
 r.board[p_cell+1]:=mark;
 foreach line slice 1 in array array[[1,2,3],[4,5,6],[7,8,9],[1,4,7],[2,5,8],[3,6,9],[1,5,9],[3,5,7]] loop
  if r.board[line[1]]=mark and r.board[line[2]]=mark and r.board[line[3]]=mark then winner:=p_user;reason:='line';exit;end if;
 end loop;
 if winner is null and not(''=any(r.board)) then reason:='draw';end if;
 update public.rewards_ttt_rooms set board=r.board,status=case when reason is null then 'active' else 'finished' end,
 winner_id=winner,finish_reason=reason,turn=case when mark='X' then 'O' else 'X' end,
 turn_deadline=clock_timestamp()+interval '60 seconds',revision=revision+1,updated_at=clock_timestamp() where id=p_room;
 return jsonb_build_object('ok',true,'roomId',p_room);
end; $$;

create function public.rewards_ttt_leave(p_user uuid,p_room uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.rewards_ttt_rooms%rowtype;
begin
 select * into r from public.rewards_ttt_rooms where id=p_room for update;
 if not found then raise exception 'room_not_found'; end if;
 if not coalesce(p_user in(r.host_id,r.guest_id),false) then raise exception 'not_participant'; end if;
 perform public.rewards_ttt_sync(p_room);
 select * into r from public.rewards_ttt_rooms where id=p_room;
 if r.status in('waiting','active') then
 update public.rewards_ttt_rooms set status=case when r.status='waiting' then 'cancelled' else 'finished' end,
 finish_reason=case when r.status='waiting' then 'cancelled' else 'resigned' end,
 winner_id=case when r.status='active' then case when p_user=host_id then guest_id else host_id end end,
 revision=revision+1,updated_at=clock_timestamp() where id=p_room;
 end if;
 return jsonb_build_object('ok',true,'roomId',p_room);
end; $$;

revoke all on function public.rewards_ttt_sync(uuid),public.rewards_ttt_json(public.rewards_ttt_rooms,uuid),public.rewards_ttt_state(uuid,uuid),public.rewards_ttt_create(uuid,uuid,text),public.rewards_ttt_join(uuid,uuid,text,boolean),public.rewards_ttt_move(uuid,uuid,integer,integer),public.rewards_ttt_leave(uuid,uuid) from public,anon,authenticated;
grant execute on function public.rewards_ttt_sync(uuid),public.rewards_ttt_json(public.rewards_ttt_rooms,uuid),public.rewards_ttt_state(uuid,uuid),public.rewards_ttt_create(uuid,uuid,text),public.rewards_ttt_join(uuid,uuid,text,boolean),public.rewards_ttt_move(uuid,uuid,integer,integer),public.rewards_ttt_leave(uuid,uuid) to service_role;
