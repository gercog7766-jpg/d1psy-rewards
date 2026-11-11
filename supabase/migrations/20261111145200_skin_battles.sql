create table public.rewards_skin_battles (
 id uuid primary key,
 creator_id uuid not null references public.rewards_users(id),
 max_players smallint not null check(max_players between 2 and 4),
 status text not null default 'waiting' check(status in ('waiting','completed','cancelled')),
 total_value integer not null default 0 check(total_value>=0),
 winner_user_id uuid references public.rewards_users(id),
 winner_entry_id uuid,
 draw_value integer,
 expires_at timestamptz not null default (clock_timestamp()+interval '10 minutes'),
 created_at timestamptz not null default clock_timestamp(),
 resolved_at timestamptz
);
create index rewards_skin_battles_lobby_idx on public.rewards_skin_battles(created_at desc) where status='waiting';
create index rewards_skin_battles_creator_idx on public.rewards_skin_battles(creator_id,created_at desc);

create table public.rewards_skin_battle_entries (
 id uuid primary key default gen_random_uuid(),
 battle_id uuid not null references public.rewards_skin_battles(id),
 user_id uuid not null references public.rewards_users(id),
 source_win_id uuid not null unique references public.rewards_wins(id),
 prize_id uuid not null references public.rewards_prizes(id),
 value integer not null check(value>0),
 item_wear text,
 item_variant_kind text,
 display_name text not null,
 avatar_url text,
 status text not null default 'reserved' check(status in ('reserved','transferred','returned')),
 awarded_win_id uuid references public.rewards_wins(id),
 created_at timestamptz not null default clock_timestamp(),
 unique(battle_id,user_id),
 unique(battle_id,id)
);
create index rewards_skin_battle_entries_battle_idx on public.rewards_skin_battle_entries(battle_id,created_at,id);
create index rewards_skin_battle_entries_active_user_idx on public.rewards_skin_battle_entries(user_id) where status='reserved';
alter table public.rewards_skin_battles add constraint rewards_skin_battles_winner_entry_fk
 foreign key(id,winner_entry_id) references public.rewards_skin_battle_entries(battle_id,id);

alter table public.rewards_skin_battles enable row level security;
alter table public.rewards_skin_battle_entries enable row level security;
revoke all on public.rewards_skin_battles,public.rewards_skin_battle_entries from public,anon,authenticated;
grant select,insert,update,delete on public.rewards_skin_battles,public.rewards_skin_battle_entries to service_role;

create function public.rewards_skin_battle_json(p_battle uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object(
  'id',b.id,'creatorId',b.creator_id,'maxPlayers',b.max_players,'status',b.status,
  'totalValue',b.total_value,'winnerUserId',b.winner_user_id,'winnerEntryId',b.winner_entry_id,
  'expiresAt',b.expires_at,'createdAt',b.created_at,
  'players',coalesce((select jsonb_agg(jsonb_build_object(
   'entryId',e.id,'userId',e.user_id,'displayName',e.display_name,'avatarUrl',e.avatar_url,
   'winId',e.source_win_id,'prizeId',e.prize_id,'prizeName',p.name,'imageUrl',p.image_url,
   'wear',e.item_wear,'variantKind',e.item_variant_kind,
   'value',e.value,'chance',round(e.value::numeric/nullif(b.total_value,0)*100,2)
  ) order by e.created_at,e.id) from public.rewards_skin_battle_entries e
   join public.rewards_prizes p on p.id=e.prize_id where e.battle_id=b.id),'[]'::jsonb)
 ) from public.rewards_skin_battles b where b.id=p_battle;
$$;

create function public.rewards_skin_battle_state(p_user uuid) returns jsonb
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
 where w.user_id=p_user and w.choice_status='awaiting_choice'
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

create function public.rewards_skin_battle_create(p_user uuid,p_battle uuid,p_max_players integer,p_win_id uuid) returns jsonb
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
 where w.id=p_win_id and w.user_id=p_user and w.choice_status='awaiting_choice'
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

create function public.rewards_skin_battle_join(p_user uuid,p_battle uuid,p_win_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare b public.rewards_skin_battles%rowtype; nick text; avatar text; prize uuid; prize_value integer; wear text; variant_kind text;
 total integer; roll integer; selected_entry uuid; selected_user uuid; e record; award_id uuid; row_count integer;
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
 where w.id=p_win_id and w.user_id=p_user and w.choice_status='awaiting_choice'
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
  for e in select id,prize_id,item_wear,item_variant_kind from public.rewards_skin_battle_entries where battle_id=p_battle and status='reserved' order by created_at,id loop
   insert into public.rewards_wins(user_id,prize_id,source_type,delivery_status,choice_status,item_wear,item_variant_kind)
    values(selected_user,e.prize_id,'skin_battle','awaiting_choice','awaiting_choice',e.item_wear,e.item_variant_kind) returning id into award_id;
   update public.rewards_skin_battle_entries set status='transferred',awarded_win_id=award_id where id=e.id;
  end loop;
 else
  update public.rewards_skin_battles set total_value=total where id=p_battle;
 end if;
 return jsonb_build_object('ok',true,'battle',public.rewards_skin_battle_json(p_battle));
end; $$;

create function public.rewards_skin_battle_cancel(p_user uuid,p_battle uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare b public.rewards_skin_battles%rowtype;
begin
 select * into b from public.rewards_skin_battles where id=p_battle for update;
 if not found then raise exception 'battle_not_found'; end if;
 if b.creator_id<>p_user then raise exception 'not_creator'; end if;
 if b.status<>'waiting' then raise exception 'battle_closed'; end if;
 update public.rewards_wins w set choice_status='awaiting_choice',choice_at=null
 from public.rewards_skin_battle_entries e where e.battle_id=p_battle and e.status='reserved' and e.source_win_id=w.id;
 update public.rewards_skin_battle_entries set status='returned' where battle_id=p_battle and status='reserved';
 update public.rewards_skin_battles set status='cancelled',resolved_at=clock_timestamp() where id=p_battle;
 return jsonb_build_object('ok',true,'battle',public.rewards_skin_battle_json(p_battle));
end; $$;

revoke all on function public.rewards_skin_battle_json(uuid),public.rewards_skin_battle_state(uuid),
 public.rewards_skin_battle_create(uuid,uuid,integer,uuid),public.rewards_skin_battle_join(uuid,uuid,uuid),
 public.rewards_skin_battle_cancel(uuid,uuid) from public,anon,authenticated;
grant execute on function public.rewards_skin_battle_json(uuid),public.rewards_skin_battle_state(uuid),
 public.rewards_skin_battle_create(uuid,uuid,integer,uuid),public.rewards_skin_battle_join(uuid,uuid,uuid),
 public.rewards_skin_battle_cancel(uuid,uuid) to service_role;
