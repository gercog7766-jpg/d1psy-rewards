-- A skin reserved for upgrades never appears in ordinary profile, gifting or battle inventory.

create or replace function public.rewards_skin_battle_state(p_user uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare active_id uuid; inventory jsonb; lobby jsonb; recent jsonb; expired_ids uuid[];
begin
 with expired as (
  update public.rewards_skin_battles set status='cancelled',resolved_at=clock_timestamp()
  where status='waiting' and expires_at<=clock_timestamp() returning id
 ), returned_wins as (
  update public.rewards_wins w set choice_status='awaiting_choice',choice_at=null
  from public.rewards_skin_battle_entries e join expired x on x.id=e.battle_id
  where e.source_win_id=w.id and e.status='reserved' returning w.id
 ), returned_entries as (
  update public.rewards_skin_battle_entries e set status='returned'
  from expired x where e.battle_id=x.id and e.status='reserved' returning e.id
 ) select coalesce(array_agg(id),'{}'::uuid[]) into expired_ids from expired;

 select e.battle_id into active_id from public.rewards_skin_battle_entries e
 join public.rewards_skin_battles b on b.id=e.battle_id
 where e.user_id=p_user and e.status='reserved' and b.status='waiting'
 order by e.created_at desc limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('winId',w.id,'prizeId',p.id,'name',p.name,'imageUrl',p.image_url,'wear',w.item_wear,'variantKind',w.item_variant_kind,'value',p.sell_price_coins)
  order by p.sell_price_coins,p.name,w.id),'[]'::jsonb) into inventory
 from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id
 where w.user_id=p_user and w.choice_status='awaiting_choice' and w.source_type is distinct from 'promo_upgrade'
  and w.delivery_status in('pending','awaiting_choice') and w.delivered_at is null
  and p.sell_price_coins>0;
 select coalesce(jsonb_agg(public.rewards_skin_battle_json(x.id) order by x.created_at desc),'[]'::jsonb) into lobby
 from (select b.id,b.created_at from public.rewards_skin_battles b
  where b.status='waiting' and b.expires_at>clock_timestamp()
   and (select count(*) from public.rewards_skin_battle_entries e where e.battle_id=b.id and e.status='reserved')<b.max_players
  order by b.created_at desc limit 30)x;
 select coalesce(jsonb_agg(public.rewards_skin_battle_json(x.id) order by x.resolved_at desc),'[]'::jsonb) into recent
 from (select b.id,b.resolved_at from public.rewards_skin_battles b
  where b.status in('completed','cancelled') order by b.resolved_at desc limit 10)x;
 return jsonb_build_object('serverNow',clock_timestamp(),'userId',p_user,'inventory',inventory,
  'activeBattle',case when active_id is null then null else public.rewards_skin_battle_json(active_id) end,
  'lobby',lobby,'recent',recent);
end; $$;

create or replace function public.rewards_skin_battle_create(p_user uuid,p_battle uuid,p_max_players integer,p_win_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare nick text; avatar text; prize uuid; prize_value integer; wear text; variant_kind text; row_count integer; existing_creator uuid;
begin
 if p_max_players not between 2 and 4 then raise exception 'invalid_player_count'; end if;
 perform 1 from public.rewards_users where id=p_user and not banned and not participation_restricted for update;
 if not found then raise exception 'user_not_found'; end if;
 select creator_id into existing_creator from public.rewards_skin_battles where id=p_battle for update;
 if found then
  if existing_creator<>p_user then raise exception 'battle_id_in_use'; end if;
  return jsonb_build_object('ok',true,'battle',public.rewards_skin_battle_json(p_battle));
 end if;
 if exists(select 1 from public.rewards_skin_battle_entries e join public.rewards_skin_battles b on b.id=e.battle_id
   where e.user_id=p_user and e.status='reserved' and b.status='waiting') then raise exception 'already_in_battle'; end if;
 select coalesce(u.twitch_display_name,u.twitch_login,'Игрок'),u.twitch_avatar_url,p.id,p.sell_price_coins,w.item_wear,w.item_variant_kind
 into nick,avatar,prize,prize_value,wear,variant_kind
 from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id
 join public.rewards_users u on u.id=w.user_id
 where w.id=p_win_id and w.user_id=p_user and w.choice_status='awaiting_choice' and w.source_type is distinct from 'promo_upgrade'
  and w.delivery_status in('pending','awaiting_choice') and w.delivered_at is null
  and p.sell_price_coins>0
 for update of w,p;
 if not found then raise exception 'skin_not_available'; end if;
 insert into public.rewards_skin_battles(id,creator_id,max_players,total_value) values(p_battle,p_user,p_max_players,prize_value);
 update public.rewards_wins set choice_status='contracted',choice_at=clock_timestamp()
  where id=p_win_id and user_id=p_user and choice_status='awaiting_choice';
 get diagnostics row_count=ROW_COUNT;
 if row_count<>1 then raise exception 'skin_not_available'; end if;
 insert into public.rewards_skin_battle_entries(battle_id,user_id,source_win_id,prize_id,value,item_wear,item_variant_kind,display_name,avatar_url)
  values(p_battle,p_user,p_win_id,prize,prize_value,wear,variant_kind,nick,avatar);
 return jsonb_build_object('ok',true,'battle',public.rewards_skin_battle_json(p_battle));
end; $$;

create or replace function public.rewards_skin_battle_join(p_user uuid,p_battle uuid,p_win_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare b public.rewards_skin_battles%rowtype; nick text; avatar text; prize uuid; prize_value integer; wear text; variant_kind text;
 total integer; roll integer; selected_entry uuid; selected_user uuid; award_entry record; award_id uuid; row_count integer;
begin
 perform 1 from public.rewards_users where id=p_user and not banned and not participation_restricted for update;
 if not found then raise exception 'user_not_found'; end if;
 select * into b from public.rewards_skin_battles where id=p_battle for update;
 if not found then raise exception 'battle_not_found'; end if;
 if exists(select 1 from public.rewards_skin_battle_entries where battle_id=p_battle and user_id=p_user)
 then return jsonb_build_object('ok',true,'battle',public.rewards_skin_battle_json(p_battle)); end if;
 if b.status<>'waiting' or b.expires_at<=clock_timestamp() then raise exception 'battle_closed'; end if;
 if exists(select 1 from public.rewards_skin_battle_entries e join public.rewards_skin_battles x on x.id=e.battle_id
   where e.user_id=p_user and e.status='reserved' and x.status='waiting') then raise exception 'already_in_battle'; end if;
 if (select count(*) from public.rewards_skin_battle_entries where battle_id=p_battle and status='reserved')>=b.max_players then raise exception 'battle_full'; end if;
 select coalesce(u.twitch_display_name,u.twitch_login,'Игрок'),u.twitch_avatar_url,p.id,p.sell_price_coins,w.item_wear,w.item_variant_kind
 into nick,avatar,prize,prize_value,wear,variant_kind
 from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id
 join public.rewards_users u on u.id=w.user_id
 where w.id=p_win_id and w.user_id=p_user and w.choice_status='awaiting_choice' and w.source_type is distinct from 'promo_upgrade'
  and w.delivery_status in('pending','awaiting_choice') and w.delivered_at is null
  and p.sell_price_coins>0
 for update of w,p;
 if not found then raise exception 'skin_not_available'; end if;
 update public.rewards_wins set choice_status='contracted',choice_at=clock_timestamp()
  where id=p_win_id and user_id=p_user and choice_status='awaiting_choice';
 get diagnostics row_count=ROW_COUNT;
 if row_count<>1 then raise exception 'skin_not_available'; end if;
 insert into public.rewards_skin_battle_entries(battle_id,user_id,source_win_id,prize_id,value,item_wear,item_variant_kind,display_name,avatar_url)
  values(p_battle,p_user,p_win_id,prize,prize_value,wear,variant_kind,nick,avatar);
 select coalesce(sum(value),0)::integer into total from public.rewards_skin_battle_entries where battle_id=p_battle and status='reserved';
 if (select count(*) from public.rewards_skin_battle_entries where battle_id=p_battle and status='reserved')=b.max_players then
  roll:=floor((('x'||substr(replace(gen_random_uuid()::text,'-',''),1,12))::bit(48)::bigint)::numeric
    /281474976710656*total)::integer+1;
  select id,user_id into selected_entry,selected_user from(
   select id,user_id,sum(value) over(order by created_at,id) cumulative
   from public.rewards_skin_battle_entries where battle_id=p_battle and status='reserved'
  )q where q.cumulative>=roll order by q.cumulative limit 1;
  update public.rewards_skin_battles set status='completed',total_value=total,winner_user_id=selected_user,
   winner_entry_id=selected_entry,draw_value=roll,resolved_at=clock_timestamp() where id=p_battle;
  for award_entry in select id,prize_id,item_wear,item_variant_kind from public.rewards_skin_battle_entries where battle_id=p_battle and status='reserved' order by created_at,id loop
   insert into public.rewards_wins(user_id,prize_id,source_type,delivery_status,choice_status,item_wear,item_variant_kind)
    values(selected_user,award_entry.prize_id,'skin_battle','awaiting_choice','awaiting_choice',award_entry.item_wear,award_entry.item_variant_kind) returning id into award_id;
   update public.rewards_skin_battle_entries set status='transferred',awarded_win_id=award_id where id=award_entry.id;
  end loop;
 else
  update public.rewards_skin_battles set total_value=total where id=p_battle;
 end if;
 return jsonb_build_object('ok',true,'battle',public.rewards_skin_battle_json(p_battle));
end; $$;

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
  where w.user_id=target.id and w.source_type is distinct from 'promo_upgrade' and coalesce(w.choice_status,'') not in('sold','upgraded','contracted') and w.delivery_status in('pending','awaiting_choice') and w.delivered_at is null and not exists(select 1 from public.rewards_orders shipped where shipped.win_id=w.id and shipped.status='sent')
  union all
  select o.id,o.created_at,o.item_name,o.image_url,o.item_wear,o.item_variant_kind,o.price_coins from public.rewards_orders o
  where o.user_id=target.id and o.source_type='shop' and o.status='pending' and o.win_id is null
 )select count(*) into total from items;
 actual_page:=least(greatest(coalesce(p_page,1),1),greatest(1,ceil(total/24.0)::integer));
 with items as(
  select w.id,w.won_at acquired,p.name,p.image_url,w.item_wear wear,w.item_variant_kind kind,p.sell_price_coins price from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id
  where w.user_id=target.id and w.source_type is distinct from 'promo_upgrade' and coalesce(w.choice_status,'') not in('sold','upgraded','contracted') and w.delivery_status in('pending','awaiting_choice') and w.delivered_at is null and not exists(select 1 from public.rewards_orders shipped where shipped.win_id=w.id and shipped.status='sent')
  union all
  select o.id,o.created_at,o.item_name,o.image_url,o.item_wear,o.item_variant_kind,o.price_coins from public.rewards_orders o
  where o.user_id=target.id and o.source_type='shop' and o.status='pending' and o.win_id is null
 )select coalesce(jsonb_agg(jsonb_build_object('name',x.name,'image',x.image_url,'wear',x.wear,'kind',x.kind,'priceCoins',x.price) order by x.acquired desc,x.id),'[]'::jsonb) into inventory from(select * from items order by acquired desc,id limit 24 offset (actual_page-1)*24)x;
 return base||jsonb_build_object('inventoryHidden',false,'items',inventory,'total',total,'page',actual_page,'pages',greatest(1,ceil(total/24.0)::integer));
end $$;

create or replace function public.rewards_skin_gift(p_actor text,p_login text,p_win uuid default null,p_request uuid default null)
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
   and w.choice_status='awaiting_choice' and w.source_type is distinct from 'promo_upgrade' and w.delivery_status in ('awaiting_choice','pending') and p.sell_price_coins between 1 and 30));
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
   and choice_status='awaiting_choice' and source_type is distinct from 'promo_upgrade' and delivery_status in ('awaiting_choice','pending') for update;
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
