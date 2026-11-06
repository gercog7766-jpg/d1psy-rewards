-- Service-only social data. Public profiles expose a goal percentage, never a balance.
create function public.rewards_public_goal(p_user uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('name',i.name,'image',i.image_url,'wear',v.wear,'kind',coalesce(v.variant_kind,'normal'),
  'priceCoins',case when v.id is null then i.price_coins else v.price_coins end,
  'available',(i.stock is null or i.stock>0) and (v.id is null or v.available),
  'percent',case when coalesce(case when v.id is null then i.price_coins else v.price_coins end,0)>0 then
   least(100,greatest(0,floor(100.0*(select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=p_user)/(case when v.id is null then i.price_coins else v.price_coins end))))::int else 0 end)
 from public.rewards_market_goals g join public.rewards_market_favorites f on f.id=g.favorite_id and f.user_id=g.user_id
 left join public.rewards_shop_item_variants v on v.id=f.variant_id
 join public.rewards_shop_items i on i.id=coalesce(v.shop_item_id,f.fixed_item_id)
 where g.user_id=p_user and i.status='available';
$$;

create table public.rewards_friendships(
 user_low uuid not null references public.rewards_users(id) on delete cascade,
 user_high uuid not null references public.rewards_users(id) on delete cascade,
 requested_by uuid not null references public.rewards_users(id) on delete cascade,
 status text not null default 'pending' check(status in('pending','accepted')),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(user_low,user_high),check(user_low<user_high),check(requested_by in(user_low,user_high))
);
create index rewards_friendships_high on public.rewards_friendships(user_high,status);
create table public.rewards_social_blocks(
 user_id uuid not null references public.rewards_users(id) on delete cascade,
 blocked_id uuid not null references public.rewards_users(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),primary key(user_id,blocked_id),check(user_id<>blocked_id)
);
create table public.rewards_messages(
 id bigint generated always as identity primary key,
 sender_id uuid not null references public.rewards_users(id) on delete cascade,
 recipient_id uuid not null references public.rewards_users(id) on delete cascade,
 request_id uuid not null,body text not null check(length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default clock_timestamp(),read_at timestamptz,
 unique(sender_id,request_id),check(sender_id<>recipient_id)
);
create index rewards_messages_pair on public.rewards_messages(least(sender_id,recipient_id),greatest(sender_id,recipient_id),id desc);
create index rewards_messages_inbox on public.rewards_messages(recipient_id,id desc);
create index rewards_messages_sender_time on public.rewards_messages(sender_id,created_at desc);
create index rewards_messages_unread on public.rewards_messages(recipient_id,sender_id) where read_at is null;
create table public.rewards_coin_gifts(
 id uuid primary key default gen_random_uuid(),sender_id uuid not null references public.rewards_users(id),
 recipient_id uuid not null references public.rewards_users(id),request_id uuid not null,
 amount integer not null check(amount between 1 and 10),gift_day date not null,
 sender_transaction uuid not null unique references public.rewards_coin_transactions(id),
 recipient_transaction uuid not null unique references public.rewards_coin_transactions(id),
 created_at timestamptz not null default clock_timestamp(),unique(sender_id,request_id),check(sender_id<>recipient_id)
);
create index rewards_coin_gifts_daily on public.rewards_coin_gifts(sender_id,recipient_id,gift_day) include(amount);
alter table public.rewards_coin_transactions drop constraint rewards_coin_transactions_transaction_type_check;
alter table public.rewards_coin_transactions add constraint rewards_coin_transactions_transaction_type_check check(transaction_type in('win_sale','shop_purchase','adjustment','level_reward','gift_sent','gift_received'));
alter table public.rewards_friendships enable row level security;
alter table public.rewards_social_blocks enable row level security;
alter table public.rewards_messages enable row level security;
alter table public.rewards_coin_gifts enable row level security;
revoke all on public.rewards_friendships,public.rewards_social_blocks,public.rewards_messages,public.rewards_coin_gifts from public,anon,authenticated;
grant select,insert,update,delete on public.rewards_friendships,public.rewards_social_blocks to service_role;
grant select,insert,update on public.rewards_messages to service_role;
grant select,insert on public.rewards_coin_gifts to service_role;
grant usage,select on sequence public.rewards_messages_id_seq to service_role;

create function public.rewards_social_peer(p_user uuid,p_login text) returns uuid language plpgsql security invoker set search_path='' as $$
declare peer uuid;
begin
 if not exists(select 1 from public.rewards_users where id=p_user and not coalesce(banned,false)) then raise exception 'user_unavailable';end if;
 select id into peer from public.rewards_users where lower(twitch_login)=lower(p_login) and not coalesce(banned,false);
 if not found then raise exception 'profile_not_found';end if;
 if peer=p_user then raise exception 'self_action';end if;
 return peer;
end $$;
create function public.rewards_social_blocked(p_user uuid,p_peer uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.rewards_social_blocks where (user_id=p_user and blocked_id=p_peer) or (user_id=p_peer and blocked_id=p_user));
$$;
create function public.rewards_social_profile(p_user uuid,p_login text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare peer uuid; f public.rewards_friendships; used integer; day date; blocked boolean;
begin
 peer:=public.rewards_social_peer(p_user,p_login);day:=(clock_timestamp() at time zone 'Europe/Moscow')::date;
 select * into f from public.rewards_friendships where user_low=least(p_user,peer) and user_high=greatest(p_user,peer);
 select coalesce(sum(amount),0) into used from public.rewards_coin_gifts where sender_id=p_user and recipient_id=peer and gift_day=day;
 blocked:=public.rewards_social_blocked(p_user,peer);
 return jsonb_build_object('relationship',case when f.status='accepted' then 'friends' when f.status='pending' then case when f.requested_by=p_user then 'outgoing' else 'incoming' end else 'none' end,
 'canContact',not blocked,'blockedByMe',exists(select 1 from public.rewards_social_blocks where user_id=p_user and blocked_id=peer),
 'giftRemaining',greatest(0,10-used),'giftResetAt',(day+1)::timestamp at time zone 'Europe/Moscow',
 'viewerBalance',(select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=p_user));
end $$;

create function public.rewards_friend_action(p_user uuid,p_login text,p_action text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare peer uuid; f public.rewards_friendships;
begin
 peer:=public.rewards_social_peer(p_user,p_login);
 if p_action is null or p_action not in('request','accept','remove','decline','block','unblock') then raise exception 'invalid_request';end if;
 perform 1 from public.rewards_users where id in(p_user,peer) order by id for update;
 if exists(select 1 from public.rewards_users where id in(p_user,peer) and coalesce(banned,false)) then raise exception 'user_unavailable';end if;
 if p_action='block' then
  insert into public.rewards_social_blocks(user_id,blocked_id) values(p_user,peer) on conflict do nothing;
  delete from public.rewards_friendships where user_low=least(p_user,peer) and user_high=greatest(p_user,peer);
 elsif p_action='unblock' then delete from public.rewards_social_blocks where user_id=p_user and blocked_id=peer;
 else
  if public.rewards_social_blocked(p_user,peer) then raise exception 'contact_unavailable';end if;
  select * into f from public.rewards_friendships where user_low=least(p_user,peer) and user_high=greatest(p_user,peer);
  if p_action='request' then
   if f.status='pending' and f.requested_by<>p_user then update public.rewards_friendships set status='accepted',updated_at=clock_timestamp() where user_low=f.user_low and user_high=f.user_high;
   elsif f.status is null then
    if (select count(*) from public.rewards_friendships where requested_by=p_user and status='pending')>=50 then raise exception 'requests_limit';end if;
    insert into public.rewards_friendships(user_low,user_high,requested_by) values(least(p_user,peer),greatest(p_user,peer),p_user);
   end if;
  elsif p_action='accept' then
   if f.status='accepted' then return jsonb_build_object('ok',true);end if;
   if f.status is null or f.requested_by=p_user then raise exception 'request_not_found';end if;
   update public.rewards_friendships set status='accepted',updated_at=clock_timestamp() where user_low=f.user_low and user_high=f.user_high;
  elsif p_action='decline' then
   if f.status='pending' and f.requested_by<>p_user then delete from public.rewards_friendships where user_low=f.user_low and user_high=f.user_high;end if;
  elsif p_action='remove' then
   if f.status='accepted' or f.requested_by=p_user then delete from public.rewards_friendships where user_low=f.user_low and user_high=f.user_high;end if;
  end if;
 end if;
 return jsonb_build_object('ok',true);
end $$;

create function public.rewards_send_message(p_user uuid,p_login text,p_body text,p_request uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare peer uuid; previous public.rewards_messages; mid bigint;
begin
 peer:=public.rewards_social_peer(p_user,p_login);
 if p_request is null or p_body is null or length(btrim(p_body)) not between 1 and 2000 then raise exception 'invalid_message';end if;
 perform 1 from public.rewards_users where id in(p_user,peer) order by id for update;
 if exists(select 1 from public.rewards_users where id in(p_user,peer) and coalesce(banned,false)) then raise exception 'user_unavailable';end if;
 select * into previous from public.rewards_messages where sender_id=p_user and request_id=p_request;
 if found then
  if previous.recipient_id<>peer or previous.body<>btrim(p_body) then raise exception 'request_conflict';end if;
  return jsonb_build_object('ok',true,'messageId',previous.id,'alreadySent',true);
 end if;
 if public.rewards_social_blocked(p_user,peer) then raise exception 'contact_unavailable';end if;
 if (select count(*) from public.rewards_messages where sender_id=p_user and created_at>clock_timestamp()-interval '1 minute')>=20 then raise exception 'message_rate_limit';end if;
 insert into public.rewards_messages(sender_id,recipient_id,request_id,body) values(p_user,peer,p_request,btrim(p_body)) returning id into mid;
 return jsonb_build_object('ok',true,'messageId',mid,'alreadySent',false);
end $$;
create function public.rewards_social_thread(p_user uuid,p_login text,p_before bigint default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare peer uuid; messages jsonb; oldest bigint; more boolean;
begin
 peer:=public.rewards_social_peer(p_user,p_login);
 if p_before is not null and p_before<1 then raise exception 'invalid_request';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'fromMe',m.sender_id=p_user,'text',m.body,'createdAt',m.created_at,'readAt',m.read_at) order by m.id),'[]'::jsonb),min(m.id) into messages,oldest from
 (select * from public.rewards_messages where least(sender_id,recipient_id)=least(p_user,peer) and greatest(sender_id,recipient_id)=greatest(p_user,peer) and (p_before is null or id<p_before) order by id desc limit 50)m;
 select exists(select 1 from public.rewards_messages where least(sender_id,recipient_id)=least(p_user,peer) and greatest(sender_id,recipient_id)=greatest(p_user,peer) and id<oldest) into more;
 return jsonb_build_object('messages',messages,'olderBefore',case when more then oldest end,'canSend',not public.rewards_social_blocked(p_user,peer),
 'peer',(select jsonb_build_object('login',twitch_login,'name',coalesce(twitch_display_name,twitch_login),'avatar',twitch_avatar_url) from public.rewards_users where id=peer));
end $$;
create function public.rewards_social_read(p_user uuid,p_login text,p_through bigint) returns void language plpgsql security invoker set search_path='' as $$
declare peer uuid;
begin
 peer:=public.rewards_social_peer(p_user,p_login);
 update public.rewards_messages set read_at=clock_timestamp() where recipient_id=p_user and sender_id=peer and id<=p_through and read_at is null;
end $$;

create function public.rewards_send_coin_gift(p_user uuid,p_login text,p_amount integer,p_request uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare peer uuid; previous public.rewards_coin_gifts; used integer; balance bigint; day date; stamp timestamptz; debit uuid; credit uuid; gift uuid; sender_name text; peer_name text;
begin
 peer:=public.rewards_social_peer(p_user,p_login);
 if p_request is null or p_amount is null or p_amount not between 1 and 10 then raise exception 'invalid_amount';end if;
 -- The same user-row lock as purchases and Live; stable order also protects opposite-direction transfers.
 perform 1 from public.rewards_users where id in(p_user,peer) order by id for update;
 select * into previous from public.rewards_coin_gifts where sender_id=p_user and request_id=p_request;
 if found then
  if previous.recipient_id<>peer or previous.amount<>p_amount then raise exception 'request_conflict';end if;
  return jsonb_build_object('ok',true,'giftId',previous.id,'coins',previous.amount,'alreadySent',true);
 end if;
 if exists(select 1 from public.rewards_users where id in(p_user,peer) and (coalesce(banned,false) or coalesce(participation_restricted,false))) then raise exception 'user_unavailable';end if;
 if public.rewards_social_blocked(p_user,peer) then raise exception 'contact_unavailable';end if;
 stamp:=clock_timestamp();day:=(stamp at time zone 'Europe/Moscow')::date;
 select coalesce(sum(amount),0) into used from public.rewards_coin_gifts where sender_id=p_user and recipient_id=peer and gift_day=day;
 if used+p_amount>10 then raise exception 'gift_daily_limit';end if;
 select coalesce(sum(amount),0) into balance from public.rewards_coin_transactions where user_id=p_user;
 if balance<p_amount then raise exception 'insufficient_coins';end if;
 select coalesce(twitch_display_name,twitch_login) into sender_name from public.rewards_users where id=p_user;
 select coalesce(twitch_display_name,twitch_login) into peer_name from public.rewards_users where id=peer;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note,created_at) values(p_user,-p_amount,'gift_sent','Подарок для '||peer_name,stamp) returning id into debit;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note,created_at) values(peer,p_amount,'gift_received','Подарок от '||sender_name,stamp) returning id into credit;
 insert into public.rewards_coin_gifts(sender_id,recipient_id,request_id,amount,gift_day,sender_transaction,recipient_transaction,created_at) values(p_user,peer,p_request,p_amount,day,debit,credit,stamp) returning id into gift;
 return jsonb_build_object('ok',true,'giftId',gift,'coins',p_amount,'alreadySent',false);
end $$;

create function public.rewards_social_summary(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.rewards_users where id=p_user and not coalesce(banned,false)) then raise exception 'user_unavailable';end if;
 return jsonb_build_object('unread',(select count(*) from public.rewards_messages where recipient_id=p_user and read_at is null),
 'requests',(select count(*) from public.rewards_friendships where p_user in(user_low,user_high) and requested_by<>p_user and status='pending'));
end $$;
create function public.rewards_social_hub(p_user uuid,p_page integer default 1) returns jsonb language plpgsql security invoker set search_path='' as $$
declare people jsonb; inbox jsonb; total integer; actual integer;
begin
 perform public.rewards_social_summary(p_user);
 select coalesce(jsonb_agg(jsonb_build_object('login',u.twitch_login,'name',coalesce(u.twitch_display_name,u.twitch_login),'avatar',u.twitch_avatar_url,'online',public.rewards_user_online(u.id),
 'relationship',case when f.status='accepted' then 'friends' when f.requested_by=p_user then 'outgoing' else 'incoming' end) order by f.updated_at desc),'[]'::jsonb) into people
 from public.rewards_friendships f join public.rewards_users u on u.id=case when f.user_low=p_user then f.user_high else f.user_low end where p_user in(f.user_low,f.user_high) and not coalesce(u.banned,false);
 select count(distinct u.id) into total from public.rewards_messages m join public.rewards_users u on u.id=case when m.sender_id=p_user then m.recipient_id else m.sender_id end where p_user in(m.sender_id,m.recipient_id) and not coalesce(u.banned,false);
 actual:=least(greatest(coalesce(p_page,1),1),greatest(1,ceil(total/25.0)::int));
 with peers as(select case when sender_id=p_user then recipient_id else sender_id end peer,max(id) latest from public.rewards_messages where p_user in(sender_id,recipient_id) group by 1)
 select coalesce(jsonb_agg(jsonb_build_object('login',x.twitch_login,'name',coalesce(x.twitch_display_name,x.twitch_login),'avatar',x.twitch_avatar_url,'preview',left(x.body,100),'createdAt',x.created_at,'unread',x.unread) order by x.latest desc),'[]'::jsonb) into inbox from
 (select p.latest,u.twitch_login,u.twitch_display_name,u.twitch_avatar_url,m.body,m.created_at,(select count(*) from public.rewards_messages n where n.sender_id=p.peer and n.recipient_id=p_user and n.read_at is null) unread from peers p join public.rewards_users u on u.id=p.peer join public.rewards_messages m on m.id=p.latest where not coalesce(u.banned,false) order by p.latest desc limit 25 offset (actual-1)*25)x;
 return jsonb_build_object('people',people,'inbox',inbox,'page',actual,'pages',greatest(1,ceil(total/25.0)::int))||public.rewards_social_summary(p_user);
end $$;

revoke all on function public.rewards_public_goal(uuid),public.rewards_social_peer(uuid,text),public.rewards_social_blocked(uuid,uuid),public.rewards_social_profile(uuid,text),public.rewards_friend_action(uuid,text,text),public.rewards_send_message(uuid,text,text,uuid),public.rewards_social_thread(uuid,text,bigint),public.rewards_social_read(uuid,text,bigint),public.rewards_send_coin_gift(uuid,text,integer,uuid),public.rewards_social_summary(uuid),public.rewards_social_hub(uuid,integer) from public,anon,authenticated;
grant execute on function public.rewards_public_goal(uuid),public.rewards_social_peer(uuid,text),public.rewards_social_blocked(uuid,uuid),public.rewards_social_profile(uuid,text),public.rewards_friend_action(uuid,text,text),public.rewards_send_message(uuid,text,text,uuid),public.rewards_social_thread(uuid,text,bigint),public.rewards_social_read(uuid,text,bigint),public.rewards_send_coin_gift(uuid,text,integer,uuid),public.rewards_social_summary(uuid),public.rewards_social_hub(uuid,integer) to service_role;

-- Public profiles show only items still held on the site, with coin value.
create or replace function public.rewards_user_profile(p_viewer uuid,p_login text,p_page integer default 1) returns jsonb language plpgsql security invoker set search_path='' as $$
declare target public.rewards_users; base jsonb; inventory jsonb; total integer; actual_page integer;
begin
 if not exists(select 1 from public.rewards_users where id=p_viewer and not coalesce(banned,false)) then raise exception 'user_unavailable';end if;
 -- A privacy change waits for this shared row lock, so one response is consistent.
 select * into target from public.rewards_users where lower(twitch_login)=lower(p_login) and not coalesce(banned,false) for share;
 if not found then raise exception 'profile_not_found';end if;
 base:=jsonb_build_object('login',target.twitch_login,'name',coalesce(nullif(target.twitch_display_name,''),target.twitch_login),'avatar',target.twitch_avatar_url,'online',public.rewards_user_online(target.id),'isPrivate',target.profile_private,'isSelf',target.id=p_viewer);
 if target.profile_private and target.id<>p_viewer then return base||jsonb_build_object('inventoryHidden',true);end if;
 base:=base||jsonb_build_object('goal',public.rewards_public_goal(target.id));
 -- Exclude sold/used items; legacy shop orders without a linked win remain visible.
 with items as(
  select w.id,w.won_at acquired,p.name,p.image_url,w.item_wear wear,w.item_variant_kind kind,p.sell_price_coins price from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id
  where w.user_id=target.id and coalesce(w.choice_status,'') not in('sold','upgraded','contracted') and w.delivery_status in('pending','awaiting_choice') and w.delivered_at is null and not exists(select 1 from public.rewards_orders shipped where shipped.win_id=w.id and shipped.status='sent')
  union all
  select o.id,o.created_at,o.item_name,o.image_url,o.item_wear,o.item_variant_kind,o.price_coins from public.rewards_orders o
  where o.user_id=target.id and o.source_type='shop' and o.status='pending' and o.win_id is null
 )select count(*) into total from items;
 actual_page:=least(greatest(coalesce(p_page,1),1),greatest(1,ceil(total/24.0)::integer));
 with items as(
  select w.id,w.won_at acquired,p.name,p.image_url,w.item_wear wear,w.item_variant_kind kind,p.sell_price_coins price from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id
  where w.user_id=target.id and coalesce(w.choice_status,'') not in('sold','upgraded','contracted') and w.delivery_status in('pending','awaiting_choice') and w.delivered_at is null and not exists(select 1 from public.rewards_orders shipped where shipped.win_id=w.id and shipped.status='sent')
  union all
  select o.id,o.created_at,o.item_name,o.image_url,o.item_wear,o.item_variant_kind,o.price_coins from public.rewards_orders o
  where o.user_id=target.id and o.source_type='shop' and o.status='pending' and o.win_id is null
 )select coalesce(jsonb_agg(jsonb_build_object('name',x.name,'image',x.image_url,'wear',x.wear,'kind',x.kind,'priceCoins',x.price) order by x.acquired desc,x.id),'[]'::jsonb) into inventory from(select * from items order by acquired desc,id limit 24 offset (actual_page-1)*24)x;
 return base||jsonb_build_object('inventoryHidden',false,'items',inventory,'total',total,'page',actual_page,'pages',greatest(1,ceil(total/24.0)::integer));
end $$;
