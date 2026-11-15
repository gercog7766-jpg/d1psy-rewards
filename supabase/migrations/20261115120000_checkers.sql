create table public.rewards_checkers_rooms (
  id uuid primary key,
  host_id uuid not null references public.rewards_users(id),
  guest_id uuid references public.rewards_users(id),
  password_hash text,
  stake integer not null check (stake between 1 and 100),
  status text not null default 'waiting' check (status in ('waiting','active','won','draw','cancelled')),
  position jsonb not null,
  revision integer not null default 0,
  deadline timestamptz not null,
  winner_id uuid references public.rewards_users(id),
  draw_by uuid references public.rewards_users(id),
  reason text
);
create index rewards_checkers_deadline_idx on public.rewards_checkers_rooms(deadline) where status in ('waiting','active');
create index rewards_checkers_host_idx on public.rewards_checkers_rooms(host_id) where status in ('waiting','active');
create index rewards_checkers_guest_idx on public.rewards_checkers_rooms(guest_id) where status = 'active';
alter table public.rewards_checkers_rooms enable row level security;
revoke all on public.rewards_checkers_rooms from public, anon, authenticated;
grant select, insert, update on public.rewards_checkers_rooms to service_role;

create function public.rewards_checkers_fund(p_user uuid, p_skin uuid, p_stake integer, p_room uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if p_skin is not null then
    perform 1 from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id
    where w.id=p_skin and w.user_id=p_user and w.choice_status='awaiting_choice'
      and w.delivery_status in ('pending','awaiting_choice') and p.sell_price_coins=p_stake
    for update of w;
    if not found then raise exception 'invalid_skin'; end if;
    perform public.rewards_sell_win(p_skin,p_user);
  elsif (select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=p_user)<p_stake then
    raise exception 'insufficient_coins';
  end if;
  insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
    values(p_user,-p_stake,'adjustment','Шашки · ставка · '||p_room);
end;
$$;

create function public.rewards_checkers_finish(p_room uuid, p_winner uuid, p_reason text)
returns void language plpgsql set search_path = '' as $$
declare room public.rewards_checkers_rooms;
begin
  select * into room from public.rewards_checkers_rooms where id=p_room for update;
  if room.status not in ('active','waiting') then return; end if;
  if p_winner is not null and (room.status <> 'active' or p_winner not in (room.host_id,room.guest_id)) then
    raise exception 'invalid_winner';
  end if;
  perform 1 from public.rewards_users where id in (room.host_id,room.guest_id) order by id for update;
  if p_winner is not null then
    insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
      values(p_winner,room.stake*18/10,'adjustment','Шашки · выигрыш · '||room.id);
  else
    insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
      select id,room.stake,'adjustment','Шашки · возврат · '||room.id
      from public.rewards_users where id in (room.host_id,room.guest_id);
  end if;
  update public.rewards_checkers_rooms set status=case
      when p_winner is not null then 'won' when room.status='waiting' then 'cancelled' else 'draw' end,
    winner_id=p_winner, draw_by=null, reason=p_reason where id=room.id;
end;
$$;

create function public.rewards_checkers_expire(p_room uuid default null)
returns void language plpgsql set search_path = '' as $$
declare room public.rewards_checkers_rooms;
begin
  for room in select * from public.rewards_checkers_rooms
    where status in ('waiting','active') and deadline<=clock_timestamp()
      and (p_room is null or id=p_room)
    order by deadline limit 20 for update skip locked
  loop
    perform public.rewards_checkers_finish(room.id,
      case when room.status='active' then
        case when room.position->>'turn'='w' then room.guest_id else room.host_id end
      end,'timeout');
  end loop;
end;
$$;

create function public.rewards_checkers_state(p_actor text, p_room uuid default null)
returns jsonb language plpgsql set search_path = '' as $$
declare player public.rewards_users; room public.rewards_checkers_rooms;
begin
  select * into player from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false);
  if not found then raise exception 'user_unavailable'; end if;
  if p_room is not null then
    select * into room from public.rewards_checkers_rooms where id=p_room;
    if room.id is null then raise exception 'room_not_found'; end if;
    if room.status in ('waiting','active') and room.deadline<=clock_timestamp() then
      perform public.rewards_checkers_expire(room.id);
      select * into room from public.rewards_checkers_rooms where id=p_room;
    end if;
    if not coalesce(player.id in (room.host_id,room.guest_id),false) and room.status<>'waiting' then
      raise exception 'not_participant';
    end if;
    return jsonb_build_object('id',room.id,'stake',room.stake,'status',room.status,'deadline',room.deadline,
      'private',room.password_hash is not null,'revision',room.revision,'reason',room.reason,
      'side',case when player.id=room.host_id then 'w' when player.id=room.guest_id then 'b' end,
      'winner',case when room.winner_id=room.host_id then 'w' when room.winner_id=room.guest_id then 'b' end,
      'drawBy',case when room.draw_by=room.host_id then 'w' when room.draw_by=room.guest_id then 'b' end,
      'host',(select coalesce(twitch_display_name,twitch_login) from public.rewards_users where id=room.host_id),
      'guest',(select coalesce(twitch_display_name,twitch_login) from public.rewards_users where id=room.guest_id),
      'board',room.position->'board','turn',room.position->'turn','forced',room.position->'forced',
      'captured',room.position->'captured','now',clock_timestamp());
  end if;
  return jsonb_build_object(
    'balance',(select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=player.id),
    'mine',(select id from public.rewards_checkers_rooms where status in ('waiting','active') and player.id in (host_id,guest_id) limit 1),
    'rooms',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'stake',r.stake,'private',r.password_hash is not null,
       'host',coalesce(u.twitch_display_name,u.twitch_login)) order by r.deadline),'[]'::jsonb)
       from (select * from public.rewards_checkers_rooms where status='waiting' and password_hash is null and deadline>clock_timestamp()
         order by deadline limit 60) r join public.rewards_users u on u.id=r.host_id),
    'skins',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (select w.id,p.name,p.sell_price_coins as price
      from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id
      where w.user_id=player.id and w.choice_status='awaiting_choice' and w.delivery_status in ('pending','awaiting_choice')
        and p.sell_price_coins between 1 and 100 order by p.sell_price_coins,w.id limit 250) x));
end;
$$;

create function public.rewards_checkers_action(p_actor text, p_room uuid, p_action text, p_data jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  actor uuid; room public.rewards_checkers_rooms; side text; enemy uuid;
  stake integer; skin uuid; next_turn text;
begin
  select id into actor from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false)
    and (p_action not in ('create','join') or not coalesce(participation_restricted,false));
  if actor is null then raise exception 'user_unavailable'; end if;
  if p_action in ('create','join') then
    perform pg_advisory_xact_lock(hashtextextended('checkers-entry:'||actor,0));
  end if;
  select * into room from public.rewards_checkers_rooms where id=p_room for update;

  if p_action='create' then
    if room.id is not null then
      if room.host_id=actor then return jsonb_build_object('id',room.id); end if;
      raise exception 'room_not_found';
    end if;
    if exists(select 1 from public.rewards_checkers_rooms where status in ('waiting','active') and actor in (host_id,guest_id)) then
      raise exception 'already_in_room';
    end if;
    stake := (p_data->>'stake')::integer;
    skin := (p_data->>'skin')::uuid;
    if stake is null or stake not between 1 and 100 then raise exception 'invalid_stake'; end if;
    if skin is not null then perform pg_advisory_xact_lock(hashtextextended(actor::text,0)); end if;
    perform 1 from public.rewards_users where id=actor for update;
    perform public.rewards_checkers_fund(actor,skin,stake,p_room);
    insert into public.rewards_checkers_rooms(id,host_id,stake,password_hash,position,deadline)
      values(p_room,actor,stake,p_data->>'proof',p_data->'position',clock_timestamp()+interval '15 minutes');
    return jsonb_build_object('id',p_room);
  end if;

  if room.id is null then raise exception 'room_not_found'; end if;
  if p_action='join' then
    if coalesce(actor in (room.host_id,room.guest_id),false) then return jsonb_build_object('id',room.id); end if;
    if room.status<>'waiting' or room.deadline<=clock_timestamp() then raise exception 'room_closed'; end if;
    if room.password_hash is not null and room.password_hash is distinct from p_data->>'proof' then
      raise exception 'wrong_password';
    end if;
    if exists(select 1 from public.rewards_checkers_rooms where status in ('waiting','active') and actor in (host_id,guest_id)) then
      raise exception 'already_in_room';
    end if;
    skin := (p_data->>'skin')::uuid;
    if skin is not null then perform pg_advisory_xact_lock(hashtextextended(actor::text,0)); end if;
    perform 1 from public.rewards_users where id=actor for update;
    if room.deadline<=clock_timestamp() then raise exception 'room_closed'; end if;
    perform public.rewards_checkers_fund(actor,skin,room.stake,room.id);
    update public.rewards_checkers_rooms set guest_id=actor,status='active',deadline=clock_timestamp()+interval '60 seconds' where id=room.id;
    return jsonb_build_object('id',room.id);
  end if;

  side := case when actor=room.host_id then 'w' when actor=room.guest_id then 'b' end;
  if side is null then raise exception 'not_participant'; end if;
  enemy := case when side='w' then room.guest_id else room.host_id end;
  if room.status in ('waiting','active') and room.deadline<=clock_timestamp() then
    perform public.rewards_checkers_finish(room.id,
      case when room.status='active' then
        case when room.position->>'turn'='w' then room.guest_id else room.host_id end end,'timeout');
  elsif p_action='leave' and room.status in ('waiting','active') then
    perform public.rewards_checkers_finish(room.id,enemy,case when room.status='waiting' then 'cancelled' else 'resigned' end);
  elsif room.status='active' then
    if p_action='draw' then
      if room.draw_by=enemy then perform public.rewards_checkers_finish(room.id,null,'agreed');
      else update public.rewards_checkers_rooms set draw_by=actor where id=room.id; end if;
    elsif p_action='move' then
      if side<>room.position->>'turn' then raise exception 'not_your_turn'; end if;
      if room.revision is distinct from (p_data->>'revision')::integer then raise exception 'stale_move'; end if;
      next_turn := p_data->'position'->>'turn';
      update public.rewards_checkers_rooms set position=p_data->'position',revision=revision+1,draw_by=null,
        deadline=case when next_turn<>side then clock_timestamp()+interval '60 seconds' else deadline end
        where id=room.id;
      if (p_data->>'won')::boolean then perform public.rewards_checkers_finish(room.id,actor,'no_moves');
      elsif (p_data->>'draw')::boolean then perform public.rewards_checkers_finish(room.id,null,'position'); end if;
    end if;
  end if;
  return public.rewards_checkers_state(p_actor,p_room);
end;
$$;
revoke all on function public.rewards_checkers_fund(uuid,uuid,integer,uuid), public.rewards_checkers_finish(uuid,uuid,text),
  public.rewards_checkers_expire(uuid),public.rewards_checkers_state(text,uuid),public.rewards_checkers_action(text,uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.rewards_checkers_fund(uuid,uuid,integer,uuid), public.rewards_checkers_finish(uuid,uuid,text),
  public.rewards_checkers_expire(uuid),public.rewards_checkers_state(text,uuid),public.rewards_checkers_action(text,uuid,text,jsonb)
  to service_role;

-- Room chat now accepts members of either game. Preserve the old FK's cleanup.
alter table public.rewards_live_chat drop constraint rewards_live_chat_room_id_fkey;
create function public.rewards_delete_game_room_chat() returns trigger
language plpgsql set search_path = '' as $$
begin
  delete from public.rewards_live_chat where room_id=old.id;
  return old;
end;
$$;
revoke all on function public.rewards_delete_game_room_chat() from public, anon, authenticated;
create trigger rewards_ttt_remove_chat after delete on public.rewards_ttt_rooms
  for each row execute function public.rewards_delete_game_room_chat();
create trigger rewards_checkers_remove_chat after delete on public.rewards_checkers_rooms
  for each row execute function public.rewards_delete_game_room_chat();

create or replace function public.rewards_live_chat_feed(p_actor text,p_room uuid,p_message text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare sender public.rewards_users%rowtype; cutoff timestamptz:=statement_timestamp()-interval '2 hours';
begin
 select * into sender from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false);
 if not found then raise exception 'chat_unavailable';end if;
 if p_room is not null and not exists(select 1 from public.rewards_ttt_rooms
   where id=p_room and sender.id in(host_id,guest_id))
   and not exists(select 1 from public.rewards_checkers_rooms where id=p_room and sender.id in(host_id,guest_id)) then raise exception 'chat_unavailable';end if;
 if p_message is not null then
  if char_length(btrim(p_message)) not between 1 and 140 or p_message~'[[:cntrl:]]'
    then raise exception 'invalid_message';end if;
  perform pg_advisory_xact_lock(hashtextextended('live-chat-sender:'||sender.id,0));
  if exists(select 1 from public.rewards_live_chat where sender_id=sender.id
    and created_at>clock_timestamp()-interval '2 seconds') then raise exception 'chat_rate_limit';end if;
  perform pg_advisory_xact_lock(hashtextextended('live-chat-room:'||coalesce(p_room::text,'public'),0));
  insert into public.rewards_live_chat(room_id,sender_id,nick,message)
    values(p_room,sender.id,coalesce(nullif(sender.twitch_display_name,''),sender.twitch_login,'Игрок'),btrim(p_message));
  delete from public.rewards_live_chat where id in(select id from public.rewards_live_chat
    where room_id is not distinct from p_room order by id desc offset 100);
 end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',m.id::text,'nick',m.nick,'message',m.message,'at',m.created_at) order by m.id),'[]'::jsonb)
 from (select id,nick,message,created_at from public.rewards_live_chat
   where room_id is not distinct from p_room and created_at>cutoff order by id desc limit 100) m);
end $$;
