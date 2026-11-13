-- Apply before activating the application release.
alter table public.rewards_coin_gifts drop constraint rewards_coin_gifts_amount_check;
alter table public.rewards_coin_gifts add constraint rewards_coin_gifts_amount_check check(amount between 1 and 20);
create index rewards_coin_gifts_sender_day on public.rewards_coin_gifts(sender_id,gift_day);

CREATE OR REPLACE FUNCTION public.rewards_send_coin_gift(p_user uuid, p_login text, p_amount integer, p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare peer uuid; previous public.rewards_coin_gifts; used integer; balance bigint; day date; stamp timestamptz; debit uuid; credit uuid; gift uuid; sender_name text; peer_name text;
begin
 peer:=public.rewards_social_peer(p_user,p_login);
 if p_request is null or p_amount is null or p_amount not between 1 and 20 then raise exception 'invalid_amount';end if;
 -- The same user-row lock as purchases and Live; stable order also protects opposite-direction transfers.
 perform 1 from public.rewards_users where id in(p_user,peer) order by id for update;
 select * into previous from public.rewards_coin_gifts where sender_id=p_user and request_id=p_request;
 if found then
  if previous.recipient_id<>peer or previous.amount<>p_amount then raise exception 'request_conflict';end if;
  return jsonb_build_object('ok',true,'giftId',previous.id,'coins',previous.amount,'alreadySent',true);
 end if;
 if exists(select 1 from public.rewards_users where id in(p_user,peer) and coalesce(banned,false)) then raise exception 'user_unavailable';end if;
 if public.rewards_social_blocked(p_user,peer) then raise exception 'contact_unavailable';end if;
 stamp:=clock_timestamp();day:=(stamp at time zone 'Europe/Moscow')::date;
 select coalesce(sum(amount),0) into used from public.rewards_coin_gifts where sender_id=p_user and gift_day=day;
 if used+p_amount>20 then raise exception 'gift_daily_limit';end if;
 select coalesce(sum(amount),0) into balance from public.rewards_coin_transactions where user_id=p_user;
 if balance<p_amount then raise exception 'insufficient_coins';end if;
 select coalesce(twitch_display_name,twitch_login) into sender_name from public.rewards_users where id=p_user;
 select coalesce(twitch_display_name,twitch_login) into peer_name from public.rewards_users where id=peer;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note,created_at) values(p_user,-p_amount,'gift_sent','Подарок для '||peer_name,stamp) returning id into debit;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note,created_at) values(peer,p_amount,'gift_received','Подарок от '||sender_name,stamp) returning id into credit;
 insert into public.rewards_coin_gifts(sender_id,recipient_id,request_id,amount,gift_day,sender_transaction,recipient_transaction,created_at) values(p_user,peer,p_request,p_amount,day,debit,credit,stamp) returning id into gift;
 return jsonb_build_object('ok',true,'giftId',gift,'coins',p_amount,'alreadySent',false);
end $function$
;
CREATE OR REPLACE FUNCTION public.rewards_social_profile(p_user uuid, p_login text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare peer uuid; f public.rewards_friendships; used integer; day date; blocked boolean;
begin
 peer:=public.rewards_social_peer(p_user,p_login);day:=(clock_timestamp() at time zone 'Europe/Moscow')::date;
 select * into f from public.rewards_friendships where user_low=least(p_user,peer) and user_high=greatest(p_user,peer);
 select coalesce(sum(amount),0) into used from public.rewards_coin_gifts where sender_id=p_user and gift_day=day;
 blocked:=public.rewards_social_blocked(p_user,peer);
 return jsonb_build_object('relationship',case when f.status='accepted' then 'friends' when f.status='pending' then case when f.requested_by=p_user then 'outgoing' else 'incoming' end else 'none' end,
 'canContact',not blocked,'blockedByMe',exists(select 1 from public.rewards_social_blocks where user_id=p_user and blocked_id=peer),
 'giftRemaining',greatest(0,20-used),'giftResetAt',(day+1)::timestamp at time zone 'Europe/Moscow',
 'viewerBalance',(select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=p_user));
end $function$
;
CREATE OR REPLACE FUNCTION public.rewards_guess_state(p_round uuid, p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select jsonb_build_object('wins',(
 select coalesce(jsonb_agg(to_jsonb(h) order by h.at desc,h.id),'[]'::jsonb) from (
 select g.id,g.ended_at as at,coalesce(u.twitch_display_name,u.twitch_login,'Игрок') as nick,
 g.secret_word as word,coalesce(p.name,g.prize_coins||' мон.') as prize
 from public.rewards_guess_rounds g left join public.rewards_users u on u.id=g.winner_id
 left join public.rewards_prizes p on p.id=g.prize_id
 where g.status='won' order by g.ended_at desc,g.id limit 10
 ) h),'balance',(select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=p_user),
 'round',(select jsonb_build_object('id',r.id,'hint',r.hint,'length',char_length(r.secret_word),'cost',r.cost,'status',r.status,
 'prizeCoins',r.prize_coins,'prize',case when p.id is null then null else jsonb_build_object('name',p.name,'image',p.image_url) end,
 'answer',case when r.status='won' then r.secret_word else null end,
 'winner',case when r.status='won' then jsonb_build_object('login',u.twitch_login,'name',u.twitch_display_name) else null end,
 'wonByMe',coalesce(r.winner_id=p_user,false),
 'recent',(select coalesce(jsonb_agg(t.guess order by t.id desc),'[]'::jsonb) from (select a.id,a.guess from public.rewards_guess_attempts a where a.round_id=r.id and not a.correct order by a.id desc limit 50)t))
 from public.rewards_guess_rounds r left join public.rewards_prizes p on p.id=r.prize_id left join public.rewards_users u on u.id=r.winner_id where r.id=p_round))
$function$
;

create table public.rewards_live_chat (
 id bigint generated always as identity primary key,
 room_id uuid references public.rewards_ttt_rooms(id) on delete cascade,
 sender_id uuid not null references public.rewards_users(id) on delete cascade,
 nick text not null, message text not null check(char_length(message) between 1 and 140),
 created_at timestamptz not null default clock_timestamp()
);
create index rewards_live_chat_scope on public.rewards_live_chat(room_id,id desc);
create index rewards_live_chat_sender on public.rewards_live_chat(sender_id,created_at desc);
create index rewards_live_chat_expiry on public.rewards_live_chat(created_at);
alter table public.rewards_live_chat enable row level security;
revoke all on public.rewards_live_chat from public,anon,authenticated;
grant select,insert,delete on public.rewards_live_chat to service_role;
grant usage on sequence public.rewards_live_chat_id_seq to service_role;

create function public.rewards_live_chat_feed(p_actor text,p_room uuid,p_message text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare sender public.rewards_users%rowtype; cutoff timestamptz:=statement_timestamp()-interval '2 hours';
begin
 select * into sender from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false);
 if not found then raise exception 'chat_unavailable';end if;
 if p_room is not null and not exists(select 1 from public.rewards_ttt_rooms
   where id=p_room and sender.id in(host_id,guest_id)) then raise exception 'chat_unavailable';end if;
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
revoke all on function public.rewards_live_chat_feed(text,uuid,text) from public,anon,authenticated;
grant execute on function public.rewards_live_chat_feed(text,uuid,text) to service_role;
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('dropso-live-chat-expiry','* * * * *','delete from public.rewards_live_chat where created_at <= now()-interval ''2 hours''');
 end if;
end $$;

create table public.rewards_skin_gifts (
 sender_id uuid not null references public.rewards_users(id),
 recipient_id uuid not null references public.rewards_users(id),
 gift_day date not null,
 request_id uuid not null,
 source_win uuid not null unique references public.rewards_wins(id),
 received_win uuid not null unique references public.rewards_wins(id),
 primary key(sender_id,gift_day), unique(sender_id,request_id)
);
alter table public.rewards_skin_gifts enable row level security;
revoke all on public.rewards_skin_gifts from public,anon,authenticated;
grant select,insert on public.rewards_skin_gifts to service_role;
alter table public.rewards_wins drop constraint rewards_wins_choice_status_check;
alter table public.rewards_wins add constraint rewards_wins_choice_status_check
 check(choice_status in ('awaiting_choice','claimed','sold','upgraded','contracted','gifted'));

create function public.rewards_skin_gift(p_actor text,p_login text,p_win uuid default null,p_request uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare sender uuid; peer uuid; current_day date; previous public.rewards_skin_gifts;
 item public.rewards_wins; price integer; received uuid;
begin
 select id into sender from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false);
 if sender is null then raise exception 'user_unavailable';end if;
 peer:=public.rewards_social_peer(sender,p_login);
 if public.rewards_social_blocked(sender,peer) then raise exception 'contact_unavailable';end if;
 current_day:=(clock_timestamp() at time zone 'Europe/Moscow')::date;
 if p_win is null and p_request is null then
  return jsonb_build_object('used',exists(select 1 from public.rewards_skin_gifts g where g.sender_id=sender and g.gift_day=current_day),
   'items',(select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'name',p.name,'price',p.sell_price_coins,'wear',w.item_wear,'kind',w.item_variant_kind) order by w.won_at desc),'[]'::jsonb)
   from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id where w.user_id=sender
   and w.choice_status='awaiting_choice' and w.delivery_status in ('awaiting_choice','pending') and p.sell_price_coins between 1 and 30));
 end if;
 if p_win is null or p_request is null then raise exception 'invalid_request';end if;
 perform 1 from public.rewards_users where id in(sender,peer) order by id for update;
 if exists(select 1 from public.rewards_users where id in(sender,peer) and coalesce(banned,false))
   then raise exception 'user_unavailable';end if;
 if public.rewards_social_blocked(sender,peer) then raise exception 'contact_unavailable';end if;
 select * into previous from public.rewards_skin_gifts g where g.sender_id=sender and g.request_id=p_request;
 if found then
  if previous.recipient_id<>peer or previous.source_win<>p_win then raise exception 'request_conflict';end if;
  return jsonb_build_object('ok',true);
 end if;
 current_day:=(clock_timestamp() at time zone 'Europe/Moscow')::date;
 if exists(select 1 from public.rewards_skin_gifts g where g.sender_id=sender and g.gift_day=current_day)
   then raise exception 'skin_gift_limit';end if;
 select * into item from public.rewards_wins where id=p_win and user_id=sender
   and choice_status='awaiting_choice' and delivery_status in ('awaiting_choice','pending') for update;
 if not found then raise exception 'skin_unavailable';end if;
 select sell_price_coins into price from public.rewards_prizes where id=item.prize_id for share;
 if price is null or price not between 1 and 30 then raise exception 'skin_unavailable';end if;
 update public.rewards_wins set choice_status='gifted',choice_at=now() where id=item.id;
 insert into public.rewards_wins(user_id,prize_id,source_type,delivery_status,choice_status,item_wear,item_variant_kind)
 values(peer,item.prize_id,'skin_gift','awaiting_choice','awaiting_choice',item.item_wear,item.item_variant_kind)
 returning id into received;
 insert into public.rewards_skin_gifts values(sender,peer,current_day,p_request,item.id,received);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.rewards_skin_gift(text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.rewards_skin_gift(text,text,uuid,uuid) to service_role;
