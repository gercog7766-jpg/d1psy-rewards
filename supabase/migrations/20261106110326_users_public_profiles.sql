-- Member directory and public inventory projection; all access is through the server.
alter table public.rewards_users add column profile_private boolean not null default false;
create table public.rewards_site_presence (
 user_id uuid not null references public.rewards_users(id) on delete cascade,
 device_hash text not null references public.rewards_device_sessions(token_hash) on delete cascade,
 tab_id uuid not null,last_seen_at timestamptz not null default clock_timestamp(),
 primary key(user_id,device_hash,tab_id)
);
create index rewards_site_presence_recent_idx on public.rewards_site_presence(user_id,last_seen_at desc);
create index rewards_site_presence_device_idx on public.rewards_site_presence(device_hash);
alter table public.rewards_site_presence enable row level security;
revoke all on public.rewards_site_presence from public,anon,authenticated;
grant select,insert,update,delete on public.rewards_site_presence to service_role;

create function public.rewards_site_heartbeat(p_user uuid,p_device text,p_tab uuid,p_online boolean default true)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_tab is null or p_online is null then raise exception 'invalid_request'; end if;
 if not exists(select 1 from public.rewards_device_sessions d join public.rewards_users u on u.id=d.user_id where d.user_id=p_user and d.token_hash=p_device and d.expires_at>clock_timestamp() and d.hard_expires_at>clock_timestamp() and not coalesce(u.banned,false)) then raise exception 'device_required'; end if;
 if not p_online then delete from public.rewards_site_presence where user_id=p_user and device_hash=p_device and tab_id=p_tab;return;end if;
 insert into public.rewards_site_presence(user_id,device_hash,tab_id) values(p_user,p_device,p_tab)
 on conflict(user_id,device_hash,tab_id) do update set last_seen_at=clock_timestamp()
 where public.rewards_site_presence.last_seen_at<clock_timestamp()-interval '20 seconds';
 delete from public.rewards_site_presence where user_id=p_user and last_seen_at<clock_timestamp()-interval '1 day';
end $$;

create function public.rewards_user_online(p_user uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.rewards_site_presence p join public.rewards_device_sessions d on d.token_hash=p.device_hash and d.user_id=p.user_id
 where p.user_id=p_user and p.last_seen_at>statement_timestamp()-interval '2 minutes' and d.expires_at>statement_timestamp() and d.hard_expires_at>statement_timestamp());
$$;

create function public.rewards_users_directory(p_viewer uuid,p_query text default '',p_page integer default 1) returns jsonb language plpgsql security invoker set search_path='' as $$
declare total integer; online_count integer; actual_page integer; users_json jsonb; me public.rewards_users; query text:=lower(left(coalesce(p_query,''),60));
begin
 select * into me from public.rewards_users where id=p_viewer and not coalesce(banned,false);
 if not found then raise exception 'user_unavailable'; end if;
 select count(*),count(*) filter(where public.rewards_user_online(u.id)) into total,online_count from public.rewards_users u where not coalesce(u.banned,false)
 and position(query in lower(coalesce(u.twitch_login,'')||' '||coalesce(u.twitch_display_name,'')))>0;
 actual_page:=least(greatest(coalesce(p_page,1),1),greatest(1,ceil(total/24.0)::integer));
 select coalesce(jsonb_agg(jsonb_build_object('login',x.twitch_login,'name',coalesce(nullif(x.twitch_display_name,''),x.twitch_login),'avatar',x.twitch_avatar_url,'online',x.online,'isPrivate',x.profile_private,'isSelf',x.id=p_viewer) order by x.online desc,lower(coalesce(x.twitch_display_name,x.twitch_login)),x.id),'[]'::jsonb) into users_json
 from(select u.*,public.rewards_user_online(u.id) online from public.rewards_users u where not coalesce(u.banned,false)
 and position(query in lower(coalesce(u.twitch_login,'')||' '||coalesce(u.twitch_display_name,'')))>0
 order by online desc,lower(coalesce(u.twitch_display_name,u.twitch_login)),u.id limit 24 offset (actual_page-1)*24)x;
 return jsonb_build_object('users',users_json,'total',total,'onlineCount',online_count,'page',actual_page,'pages',greatest(1,ceil(total/24.0)::integer),'me',jsonb_build_object('login',me.twitch_login,'isPrivate',me.profile_private));
end $$;

create function public.rewards_profile_privacy(p_user uuid,p_private boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result boolean;
begin
 if p_private is null then raise exception 'invalid_request';end if;
 update public.rewards_users set profile_private=p_private where id=p_user and not coalesce(banned,false) returning profile_private into result;
 if not found then raise exception 'user_unavailable';end if;
 return jsonb_build_object('isPrivate',result);
end $$;

create function public.rewards_user_profile(p_viewer uuid,p_login text,p_page integer default 1) returns jsonb language plpgsql security invoker set search_path='' as $$
declare target public.rewards_users; base jsonb; inventory jsonb; total integer; actual_page integer;
begin
 if not exists(select 1 from public.rewards_users where id=p_viewer and not coalesce(banned,false)) then raise exception 'user_unavailable';end if;
 -- A privacy change waits for this shared row lock, so one response is consistent.
 select * into target from public.rewards_users where lower(twitch_login)=lower(p_login) and not coalesce(banned,false) for share;
 if not found then raise exception 'profile_not_found';end if;
 base:=jsonb_build_object('login',target.twitch_login,'name',coalesce(nullif(target.twitch_display_name,''),target.twitch_login),'avatar',target.twitch_avatar_url,'online',public.rewards_user_online(target.id),'isPrivate',target.profile_private,'isSelf',target.id=p_viewer);
 if target.profile_private and target.id<>p_viewer then return base||jsonb_build_object('inventoryHidden',true);end if;
 -- Exclude sold/used items; legacy shop orders without a linked win remain visible.
 with items as(
  select w.id,w.won_at acquired,p.name,p.image_url,w.item_wear wear,w.item_variant_kind kind from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id
  where w.user_id=target.id and coalesce(w.choice_status,'') not in('sold','upgraded','contracted')
  union all
  select o.id,o.created_at,o.item_name,o.image_url,o.item_wear,o.item_variant_kind from public.rewards_orders o
  where o.user_id=target.id and o.source_type='shop' and o.status<>'cancelled' and o.win_id is null
 )select count(*) into total from items;
 actual_page:=least(greatest(coalesce(p_page,1),1),greatest(1,ceil(total/24.0)::integer));
 with items as(
  select w.id,w.won_at acquired,p.name,p.image_url,w.item_wear wear,w.item_variant_kind kind from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id
  where w.user_id=target.id and coalesce(w.choice_status,'') not in('sold','upgraded','contracted')
  union all
  select o.id,o.created_at,o.item_name,o.image_url,o.item_wear,o.item_variant_kind from public.rewards_orders o
  where o.user_id=target.id and o.source_type='shop' and o.status<>'cancelled' and o.win_id is null
 )select coalesce(jsonb_agg(jsonb_build_object('name',x.name,'image',x.image_url,'wear',x.wear,'kind',x.kind) order by x.acquired desc,x.id),'[]'::jsonb) into inventory from(select * from items order by acquired desc,id limit 24 offset (actual_page-1)*24)x;
 return base||jsonb_build_object('inventoryHidden',false,'items',inventory,'total',total,'page',actual_page,'pages',greatest(1,ceil(total/24.0)::integer));
end $$;

revoke all on function public.rewards_site_heartbeat(uuid,text,uuid,boolean),public.rewards_user_online(uuid),public.rewards_users_directory(uuid,text,integer),public.rewards_profile_privacy(uuid,boolean),public.rewards_user_profile(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.rewards_site_heartbeat(uuid,text,uuid,boolean),public.rewards_user_online(uuid),public.rewards_users_directory(uuid,text,integer),public.rewards_profile_privacy(uuid,boolean),public.rewards_user_profile(uuid,text,integer) to service_role;
