create or replace function public.rewards_nr_leaderboard(p_user uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.rewards_users where id=p_user and not coalesce(banned,false)) then raise exception 'user_unavailable'; end if;
 return (with eligible as (
 select g.*,case when g.version=2 then g.distance/40 else g.tick::bigint*2 end as meters
 from public.rewards_nr_games g join public.rewards_users u on u.id=g.user_id
 where g.tick>0 and not coalesce(u.banned,false) and (g.status in ('crashed','stopped','expired') or (g.status='playing' and g.last_seen<now()-interval '8 seconds'))
 ), best as (
 select distinct on (user_id) user_id,meters,tick,started_at,id from eligible order by user_id,meters desc,tick,started_at,id
 ), top_runs as (
 select * from best order by meters desc,tick,started_at,id limit 10
 ), entries as (
 select row_number() over(order by b.meters desc,b.tick,b.started_at,b.id) as rank,u.twitch_login as login,u.twitch_display_name as "displayName",b.meters as "distanceMeters",b.tick as "elapsedTicks",b.user_id=p_user as "isMe"
 from top_runs b join public.rewards_users u on u.id=b.user_id
 ) select jsonb_build_object('entries',coalesce(jsonb_agg(to_jsonb(entries) order by rank),'[]'::jsonb)) from entries);
end $$;
revoke all on function public.rewards_nr_leaderboard(uuid) from public,anon,authenticated;
grant execute on function public.rewards_nr_leaderboard(uuid) to service_role;
