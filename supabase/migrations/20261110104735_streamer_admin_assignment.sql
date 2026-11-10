-- The site owner may grant the existing approved streamer status without an application.
-- No wallet funding, Twitch subscriptions or viewer rewards are created here.
create function public.rewards_streamer_live_assign(p_actor text,p_user uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare u public.rewards_users; s public.rewards_streamer_live_profiles; target text;
begin
 if not exists(select 1 from public.rewards_streamers where is_primary and twitch_broadcaster_id=p_actor) then raise exception 'owner_required';end if;
 select * into u from public.rewards_users where id=p_user;
 if not found then raise exception 'user_not_found';end if;
 if coalesce(u.banned,false) then raise exception 'user_unavailable';end if;
 if coalesce(u.twitch_user_id,'') !~ '^[0-9]{1,30}$' or lower(coalesce(u.twitch_login,'')) !~ '^[a-z0-9_]{1,25}$' then raise exception 'invalid_application';end if;
 target:=u.twitch_user_id;
 -- Same lock order as the live API: control -> profile -> user.
 perform 1 from public.rewards_streamer_live_control where id=true for share;
 insert into public.rewards_streamer_live_profiles(broadcaster_id,name,login,url)
 values(target,left(coalesce(nullif(trim(u.twitch_display_name),''),u.twitch_login),80),lower(u.twitch_login),'https://www.twitch.tv/'||lower(u.twitch_login))
 on conflict(broadcaster_id) do nothing;
 select * into s from public.rewards_streamer_live_profiles where broadcaster_id=target for update;
 select * into u from public.rewards_users where id=p_user and twitch_user_id=target and not coalesce(banned,false) for share;
 if not found then raise exception 'user_unavailable';end if;
 if lower(coalesce(u.twitch_login,'')) !~ '^[a-z0-9_]{1,25}$' then raise exception 'invalid_application';end if;
 if s.status='approved' then return jsonb_build_object('ok',true,'alreadyAssigned',true,'login',s.login);end if;
 update public.rewards_streamer_live_profiles set status='approved',login=lower(u.twitch_login),url='https://www.twitch.tv/'||lower(u.twitch_login),decided_by=p_actor,decided_at=clock_timestamp() where broadcaster_id=target;
 insert into public.rewards_streamer_live_audit(actor,action,target) values(p_actor,'assign',target);
 return jsonb_build_object('ok',true,'alreadyAssigned',false,'login',lower(u.twitch_login));
end $$;

create function public.rewards_streamer_live_candidates(p_actor text,p_query text default '',p_page integer default 1)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare total integer; actual_page integer; users_json jsonb; query text:=lower(left(coalesce(p_query,''),60));
begin
 if not exists(select 1 from public.rewards_streamers where is_primary and twitch_broadcaster_id=p_actor) then raise exception 'owner_required';end if;
 select count(*) into total from public.rewards_users u where not coalesce(u.banned,false)
 and u.twitch_user_id ~ '^[0-9]{1,30}$' and lower(u.twitch_login) ~ '^[a-z0-9_]{1,25}$'
 and position(query in lower(u.twitch_login||' '||coalesce(u.twitch_display_name,'')))>0;
 actual_page:=least(greatest(coalesce(p_page,1),1),greatest(1,ceil(total/20.0)::integer));
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'login',x.twitch_login,'name',coalesce(nullif(x.twitch_display_name,''),x.twitch_login),'avatar',x.twitch_avatar_url,'status',x.status) order by lower(coalesce(nullif(x.twitch_display_name,''),x.twitch_login)),x.twitch_login,x.id),'[]'::jsonb) into users_json
 from(select u.id,u.twitch_login,u.twitch_display_name,u.twitch_avatar_url,p.status from public.rewards_users u left join public.rewards_streamer_live_profiles p on p.broadcaster_id=u.twitch_user_id
 where not coalesce(u.banned,false) and u.twitch_user_id ~ '^[0-9]{1,30}$' and lower(u.twitch_login) ~ '^[a-z0-9_]{1,25}$'
 and position(query in lower(u.twitch_login||' '||coalesce(u.twitch_display_name,'')))>0
 order by lower(coalesce(nullif(u.twitch_display_name,''),u.twitch_login)),u.twitch_login,u.id limit 20 offset (actual_page-1)*20)x;
 return jsonb_build_object('users',users_json,'total',total,'page',actual_page,'pages',greatest(1,ceil(total/20.0)::integer));
end $$;
revoke all on function public.rewards_streamer_live_assign(text,uuid),public.rewards_streamer_live_candidates(text,text,integer) from public,anon,authenticated;
grant execute on function public.rewards_streamer_live_assign(text,uuid),public.rewards_streamer_live_candidates(text,text,integer) to service_role;
