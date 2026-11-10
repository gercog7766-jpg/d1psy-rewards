-- Order the entire filtered directory before LIMIT/OFFSET: founder, approved streamers, alphabet.
create or replace function public.rewards_users_directory(p_viewer uuid,p_query text default '',p_page integer default 1) returns jsonb language plpgsql security invoker set search_path='' as $$
declare total integer; online_count integer; actual_page integer; users_json jsonb; me public.rewards_users; query text:=lower(left(coalesce(p_query,''),60));
begin
 select * into me from public.rewards_users where id=p_viewer and not coalesce(banned,false);
 if not found then raise exception 'user_unavailable'; end if;
 select count(*),count(*) filter(where public.rewards_user_online(u.id)) into total,online_count from public.rewards_users u where not coalesce(u.banned,false)
 and position(query in lower(coalesce(u.twitch_login,'')||' '||coalesce(u.twitch_display_name,'')))>0;
 actual_page:=least(greatest(coalesce(p_page,1),1),greatest(1,ceil(total/24.0)::integer));
 select coalesce(jsonb_agg(jsonb_build_object('login',x.twitch_login,'name',coalesce(nullif(x.twitch_display_name,''),x.twitch_login),'avatar',x.twitch_avatar_url,'online',x.online,'isPrivate',x.profile_private,'isSelf',x.id=p_viewer) order by x.priority,lower(coalesce(nullif(x.twitch_display_name,''),x.twitch_login)),x.twitch_login,x.id),'[]'::jsonb) into users_json
 from(select u.*,public.rewards_user_online(u.id) online,case
  when exists(select 1 from public.rewards_streamers s where s.is_primary and s.twitch_broadcaster_id=u.twitch_user_id) then 0
  when exists(select 1 from public.rewards_streamer_live_profiles p where p.status='approved' and p.broadcaster_id=u.twitch_user_id) then 1
  else 2 end priority from public.rewards_users u where not coalesce(u.banned,false)
 and position(query in lower(coalesce(u.twitch_login,'')||' '||coalesce(u.twitch_display_name,'')))>0
 order by priority,lower(coalesce(nullif(u.twitch_display_name,''),u.twitch_login)),u.twitch_login,u.id limit 24 offset (actual_page-1)*24)x;
 return jsonb_build_object('users',users_json,'total',total,'onlineCount',online_count,'page',actual_page,'pages',greatest(1,ceil(total/24.0)::integer),'me',jsonb_build_object('login',me.twitch_login,'isPrivate',me.profile_private));
end $$;
revoke all on function public.rewards_users_directory(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.rewards_users_directory(uuid,text,integer) to service_role;
