create table public.rewards_red_button_rounds (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  prize_name text not null,
  image_url text,
  wear text,
  variant_kind text,
  price integer not null check(price between 50 and 300),
  holder uuid references public.rewards_users(id),
  held_since timestamptz,
  closed_at timestamptz,
  winner uuid references public.rewards_users(id),
  winning_ms bigint,
  win_id uuid references public.rewards_wins(id)
);
create table public.rewards_red_button_members (
  round_id uuid not null references public.rewards_red_button_rounds(id),
  user_id uuid not null references public.rewards_users(id),
  last_press timestamptz not null,
  primary key(round_id,user_id)
);
create table public.rewards_red_button_holds (
  request_id uuid primary key,
  round_id uuid not null references public.rewards_red_button_rounds(id),
  user_id uuid not null references public.rewards_users(id),
  started_at timestamptz not null,
  ended_at timestamptz
);
create index rewards_red_button_holds_round_idx on public.rewards_red_button_holds(round_id);
create unique index rewards_red_button_one_holder on public.rewards_red_button_holds(round_id) where ended_at is null;
alter table public.rewards_red_button_rounds enable row level security;
alter table public.rewards_red_button_members enable row level security;
alter table public.rewards_red_button_holds enable row level security;
revoke all on public.rewards_red_button_rounds,public.rewards_red_button_members,public.rewards_red_button_holds from public,anon,authenticated;
grant select,insert,update on public.rewards_red_button_rounds,public.rewards_red_button_members,public.rewards_red_button_holds to service_role;

create function public.rewards_red_button_tick() returns void
language plpgsql set search_path = '' as $$
declare
  today date := (clock_timestamp() at time zone 'Europe/Moscow')::date;
  game public.rewards_red_button_rounds;
  best public.rewards_red_button_holds;
  prize record;
  previous_name text;
  prize_id uuid;
  awarded uuid;
begin
  if exists(select 1 from public.rewards_red_button_rounds where day=today)
    and not exists(select 1 from public.rewards_red_button_rounds where closed_at is null and ends_at<=clock_timestamp())
    then return; end if;
  perform pg_advisory_xact_lock(519701322070::bigint);
  for game in select * from public.rewards_red_button_rounds where closed_at is null and ends_at<=clock_timestamp()
    order by day for update
  loop
    update public.rewards_red_button_holds set ended_at=game.ends_at where round_id=game.id and ended_at is null;
    select h.* into best from public.rewards_red_button_holds h join public.rewards_users u on u.id=h.user_id
      where h.round_id=game.id and not coalesce(u.banned,false) and not coalesce(u.participation_restricted,false)
      order by h.ended_at-h.started_at desc,h.started_at,h.request_id limit 1;
    awarded := null;
    if best.user_id is not null then
      insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
        values(game.prize_name,game.image_url,'disabled',true,1,game.price) returning id into prize_id;
      insert into public.rewards_wins(user_id,prize_id,source_type,delivery_status,choice_status,item_wear,item_variant_kind)
        values(best.user_id,prize_id,'red_button','awaiting_choice','awaiting_choice',game.wear,game.variant_kind) returning id into awarded;
    end if;
    update public.rewards_red_button_rounds set closed_at=clock_timestamp(),winner=best.user_id,win_id=awarded,
      winning_ms=(extract(epoch from best.ended_at-best.started_at)*1000)::bigint where id=game.id;
  end loop;

  if exists(select 1 from public.rewards_red_button_rounds where day=today) then return; end if;
  select prize_name into previous_name from public.rewards_red_button_rounds order by day desc limit 1;
  select offers.* into prize from (
    select case v.variant_kind when 'stattrak' then 'StatTrak™ ' when 'souvenir' then 'Сувенирный ' else '' end || i.name as name,
      i.image_url,v.wear,v.variant_kind,v.price_coins as price
      from public.rewards_shop_item_variants v join public.rewards_shop_items i on i.id=v.shop_item_id
      where v.price_coins between 50 and 300 and v.available and i.status='available'
        and (i.stock is null or i.stock>0) and nullif(i.image_url,'') is not null
  ) offers where offers.name is distinct from previous_name order by gen_random_uuid() limit 1;
  if not found then return; end if;
  insert into public.rewards_red_button_rounds(day,starts_at,ends_at,prize_name,image_url,wear,variant_kind,price)
    values(today,case when previous_name is null then clock_timestamp() else today::timestamp at time zone 'Europe/Moscow' end,
      (today+1)::timestamp at time zone 'Europe/Moscow',prize.name,prize.image_url,prize.wear,prize.variant_kind,prize.price);
end;
$$;

create function public.rewards_red_button(p_actor text,p_round uuid default null,p_request uuid default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
  player public.rewards_users;
  game public.rewards_red_button_rounds;
  member public.rewards_red_button_members;
  prior public.rewards_red_button_holds;
  stamp timestamptz;
  can_play boolean;
begin
  select * into player from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false);
  if not found then raise exception 'user_unavailable'; end if;
  can_play := not coalesce(player.participation_restricted,false);
  perform public.rewards_red_button_tick();
  if p_round is not null then
    if not can_play then raise exception 'user_unavailable'; end if;
    if p_request is null then raise exception 'invalid_request'; end if;
    select * into game from public.rewards_red_button_rounds where id=p_round for update;
    if game.id is null then raise exception 'round_closed'; end if;
    select * into prior from public.rewards_red_button_holds where request_id=p_request;
    if prior.request_id is not null and (prior.round_id<>p_round or prior.user_id<>player.id) then
      raise exception 'invalid_request';
    end if;
    if prior.request_id is null then
      select * into member from public.rewards_red_button_members where round_id=game.id and user_id=player.id;
      perform 1 from public.rewards_users where id=player.id and not banned and not participation_restricted for update;
      if not found then raise exception 'user_unavailable'; end if;
      stamp := clock_timestamp();
      if game.closed_at is not null or stamp>=game.ends_at then raise exception 'round_closed'; end if;
      if game.holder=player.id then raise exception 'already_holding'; end if;
      if stamp<member.last_press+interval '20 minutes' then raise exception 'cooldown'; end if;
      if member.user_id is null then
        if (select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=player.id)<10 then
          raise exception 'insufficient_coins';
        end if;
        insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
          values(player.id,-10,'adjustment','Красная кнопка · вход · '||game.id);
      end if;
      insert into public.rewards_red_button_members(round_id,user_id,last_press) values(game.id,player.id,stamp)
        on conflict(round_id,user_id) do update set last_press=excluded.last_press;
      update public.rewards_red_button_holds set ended_at=stamp where round_id=game.id and ended_at is null;
      insert into public.rewards_red_button_holds(request_id,round_id,user_id,started_at)
        values(p_request,game.id,player.id,stamp);
      update public.rewards_red_button_rounds set holder=player.id,held_since=stamp where id=game.id;
    end if;
  end if;
  select * into game from public.rewards_red_button_rounds where day=(clock_timestamp() at time zone 'Europe/Moscow')::date;
  select * into member from public.rewards_red_button_members where round_id=game.id and user_id=player.id;

  return jsonb_build_object('now',clock_timestamp(),'canPlay',can_play,
    'round',case when game.id is not null then jsonb_build_object(
      'id',game.id,'endsAt',game.ends_at,'prize',game.prize_name,'image',game.image_url,'wear',game.wear,'price',game.price,
      'holder',(select coalesce(nullif(twitch_display_name,''),twitch_login) from public.rewards_users where id=game.holder),
      'holding',coalesce(game.holder=player.id,false),'joined',member.user_id is not null,
      'readyAt',member.last_press+interval '20 minutes') end,
    'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.day desc),'[]'::jsonb) from (
      select r.day,coalesce(nullif(u.twitch_display_name,''),u.twitch_login) nick,r.prize_name as skin,r.winning_ms as duration
      from public.rewards_red_button_rounds r join public.rewards_users u on u.id=r.winner
      where r.closed_at is not null order by r.day desc limit 20
    ) h));
end;
$$;
revoke all on function public.rewards_red_button_tick(),public.rewards_red_button(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.rewards_red_button_tick(),public.rewards_red_button(text,uuid,uuid) to service_role;

create or replace function public.rewards_live_chat_feed(p_actor text,p_room uuid,p_message text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare sender public.rewards_users%rowtype; cutoff timestamptz:=statement_timestamp()-interval '2 hours';
begin
 select * into sender from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false);
 if not found then raise exception 'chat_unavailable';end if;
 if p_room is not null and not exists(select 1 from public.rewards_ttt_rooms
   where id=p_room and sender.id in(host_id,guest_id))
   and not exists(select 1 from public.rewards_checkers_rooms where id=p_room and sender.id in(host_id,guest_id))
   and not exists(select 1 from public.rewards_red_button_members where round_id=p_room and user_id=sender.id) then raise exception 'chat_unavailable';end if;
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
