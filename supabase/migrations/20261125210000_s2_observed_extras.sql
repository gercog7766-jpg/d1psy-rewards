-- Read-only S2 diagnostics. No changes to existing rewards or application flows.
-- Separate, minimal presence receipt for distinct Twitch broadcasts. No reward write.
create table public.rewards_s2_stream_visits(
 user_id uuid not null references public.rewards_users(id) on delete cascade, day date not null,
 broadcaster text not null, stream_id text not null,
 primary key(user_id,day,broadcaster,stream_id)
);
create table public.rewards_s2_stream_tracking(id boolean primary key check(id),started_at timestamptz not null);
alter table public.rewards_s2_stream_visits enable row level security;
alter table public.rewards_s2_stream_tracking enable row level security;
revoke all on public.rewards_s2_stream_visits,public.rewards_s2_stream_tracking from public,anon,authenticated;
grant select,insert on public.rewards_s2_stream_visits,public.rewards_s2_stream_tracking to service_role;
create function public.rewards_s2_record_stream_visits(p_at timestamptz,p_streams jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_at is null or abs(extract(epoch from p_at-clock_timestamp()))>120 or jsonb_typeof(p_streams) is distinct from 'array' or jsonb_array_length(p_streams)>200 then raise exception 'invalid_sample';end if;
 insert into public.rewards_s2_stream_tracking(id,started_at) values(true,p_at) on conflict do nothing;
 insert into public.rewards_s2_stream_visits(user_id,day,broadcaster,stream_id)
 select distinct p.user_id,(p_at at time zone 'Europe/Moscow')::date,p.broadcaster,x->>'streamId'
 from jsonb_array_elements(p_streams) x join public.rewards_live_economy_presence p on p.broadcaster=x->>'broadcaster' and p.observed_at=p_at
 where x->>'broadcaster'~'^[0-9]{1,30}$' and x->>'streamId'~'^[0-9]{1,30}$'
 on conflict do nothing;
end $$;
revoke all on function public.rewards_s2_record_stream_visits(timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_s2_record_stream_visits(timestamptz,jsonb) to service_role;
create function public.rewards_s2_observed_extras(p_user uuid,p_start date,p_end date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare lo timestamptz;hi timestamptz;result jsonb;
begin
 if p_user is null or p_start is null or p_end is null or p_end-p_start not between 1 and 30 then raise exception 'invalid_period';end if;
 lo:=p_start::timestamp at time zone 'Europe/Moscow';hi:=p_end::timestamp at time zone 'Europe/Moscow';
 with orders as (
  select source_type,price_coins from public.rewards_orders where user_id=p_user and created_at>=lo and created_at<hi and status in ('pending','sent')
 ), draws as (
  select count(*) n from public.rewards_round_participants p join public.rewards_rounds r on r.id=p.round_id
  where p.user_id=p_user and p.eligible and r.status='completed' and r.winner_user_id is not null and r.ended_at>=lo and r.ended_at<hi
  union all
  select count(*) from public.rewards_streamer_live_participants p join public.rewards_streamer_live_rounds r on r.id=p.round_id
  where p.user_id=p_user and r.status='completed' and r.winner is not null and r.finished_at>=lo and r.finished_at<hi
 ), earnings as (
  select coalesce(sum(t.amount),0) amount from public.rewards_coin_transactions t
  left join public.rewards_wins w on w.id=t.win_id and w.user_id=t.user_id
  where t.user_id=p_user and t.created_at>=lo and t.created_at<hi and t.amount>0 and (
   t.transaction_type in ('level_reward','referral_reward')
   or (t.transaction_type='win_sale' and w.id is not null and w.source_type is distinct from 'shop')
   or (t.transaction_type='adjustment' and t.note like any(array['LIVE REWARDS · %','LIVE STREAK · %','LIVE BOSS · %','PARTNER LIVE BOSS · %','Сапёр · победа · %','DEFUSE THE BOMB · %','NIGHT RUN · %','Бонус дня · %','Промокод стримера %','Dropso Connect · %','THE VAULT · %']))
  )
 ), checkers as (
  -- Completed rooms have no finished_at. Use their settlement transaction timestamp;
  -- include losses by checking the opponent's winning transaction without exposing it.
  select c.winner_id from public.rewards_checkers_rooms c
  where p_user in(c.host_id,c.guest_id) and c.guest_id is not null and c.status in('won','draw') and exists (
   select 1 from public.rewards_coin_transactions t where t.user_id in(c.host_id,c.guest_id) and t.created_at>=lo and t.created_at<hi
   and t.transaction_type='adjustment' and (t.note='Шашки · выигрыш · '||c.id::text or t.note='Шашки · возврат · '||c.id::text)
  )
 ) select jsonb_build_object(
  'buyPrice',coalesce((select max(price_coins) from orders where source_type='shop'),0),
  'withdrawPrice',coalesce((select max(price_coins) from orders where source_type='win'),0),
  'draws',(select sum(n) from draws),'earned',(select amount from earnings),
  'checkers',(select count(*) from checkers),'checkersWon',(select count(*) from checkers where winner_id=p_user),
  'streamVisits',case when exists(select 1 from public.rewards_s2_stream_tracking where id and started_at<=lo) then (select count(distinct (broadcaster,stream_id)) from public.rewards_s2_stream_visits where user_id=p_user and day>=p_start and day<p_end) else null end
 ) into result;
 return result;
end $$;
revoke all on function public.rewards_s2_observed_extras(uuid,date,date) from public,anon,authenticated;
grant execute on function public.rewards_s2_observed_extras(uuid,date,date) to service_role;
notify pgrst,'reload schema';
