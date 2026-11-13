create or replace function public.rewards_activity_feed(p_user uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  with streams as (
    select 'stream:' || v.broadcaster || ':' || v.stream_id as id, 'stream' as kind,
      v.started_at as at, coalesce(p.login,s.twitch_login) as detail
    from public.rewards_vault_streams v
    left join public.rewards_streamer_live_profiles p on p.broadcaster_id=v.broadcaster and p.status='approved'
    left join public.rewards_streamers s on s.twitch_broadcaster_id=v.broadcaster and s.is_primary
    where v.started_at>=now()-interval '14 days' and coalesce(p.login,s.twitch_login) is not null
    order by v.started_at desc limit 30
  ), primary_wins as (
    select 'drop:' || w.id, 'drop', w.won_at, coalesce(p.name,'Скин')
    from public.rewards_wins w left join public.rewards_prizes p on p.id=w.prize_id
    where w.user_id=p_user and w.round_id is not null and w.won_at>=now()-interval '14 days'
    order by w.won_at desc limit 30
  ), partner_wins as (
    select 'partner:' || a.id, 'drop', a.created_at, a.prize_name
    from public.rewards_streamer_live_awards a
    where a.user_id=p_user and a.round_id is not null and a.created_at>=now()-interval '14 days'
    order by a.created_at desc limit 30
  ), connect_wins as (
    select 'connect:' || a.id, 'drop', a.created_at, coalesce(a.prize_name,a.cost||' мон.')
    from public.rewards_connect_awards a
    where a.winner=p_user and a.status='awarded' and a.created_at>=now()-interval '14 days'
    order by a.created_at desc limit 30
  ), outbids as (
    select 'outbid:' || t.id, 'outbid', t.created_at, t.amount::text
    from public.rewards_coin_transactions t
    where t.user_id=p_user and t.created_at>=now()-interval '14 days'
      and t.amount>0 and t.note like 'Чёрный ящик · возврат · %'
    order by t.created_at desc limit 30
  ), feed as (
    select * from streams union all select * from primary_wins union all select * from partner_wins
    union all select * from connect_wins union all select * from outbids
    order by at desc,id limit 50
  )
  select coalesce(jsonb_agg(to_jsonb(feed) order by at desc,id),'[]'::jsonb) from feed;
$$;
revoke all on function public.rewards_activity_feed(uuid) from public,anon,authenticated;
grant execute on function public.rewards_activity_feed(uuid) to service_role;
