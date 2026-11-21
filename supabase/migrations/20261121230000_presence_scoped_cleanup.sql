-- Replace only stale presence snapshots; keep the VPS DELETE guard in force.
create or replace function public.rewards_boss_presence_sample(p_broadcaster text,p_at timestamptz,p_active boolean,p_viewers text[]) returns void
language plpgsql set search_path='' as $$
declare s public.rewards_boss_presence_state; b public.rewards_boss_runs;
begin
 if p_at is null or abs(extract(epoch from p_at-clock_timestamp()))>90 or p_active is null or p_viewers is null or cardinality(p_viewers)>50000 then raise exception 'invalid_sample';end if;
 if not exists(select 1 from public.rewards_streamers where twitch_broadcaster_id=p_broadcaster and is_primary and enabled) then raise exception 'primary_required';end if;
 perform pg_advisory_xact_lock(78104921);
 select * into s from public.rewards_boss_presence_state where id=1 for update;
 if s.observed_at is not null and p_at<=s.observed_at then return;end if;
 p_active:=p_active and exists(select 1 from public.rewards_clan_chat_channels where broadcaster=p_broadcaster and authorized_at is not null and last_error is null);
 select * into b from public.rewards_boss_runs where status='active' and not hidden;
 if p_active and s.active and s.broadcaster=p_broadcaster and b.id is not null and s.run_id=b.id and p_at-s.observed_at between interval '1 minute' and interval '6 minutes' then
  update public.rewards_boss_cooldowns c
  set remaining_seconds=greatest(0,c.remaining_seconds-least(300,greatest(0,floor(extract(epoch from p_at-greatest(s.observed_at,c.last_attack_at,b.active_since)))::int)))
  from public.rewards_boss_presence_viewers v join public.rewards_users u on u.id=v.user_id
  where c.run_id=b.id and c.remaining_seconds>0 and c.user_id=u.id and v.observed_at=s.observed_at
   and u.twitch_user_id=any(p_viewers) and not coalesce(u.banned,false) and not coalesce(u.participation_restricted,false);
 end if;
 delete from public.rewards_boss_presence_viewers where observed_at<=p_at;
 if p_active then
  insert into public.rewards_boss_presence_viewers(user_id,observed_at)
  select id,p_at from public.rewards_users where twitch_user_id=any(p_viewers) and twitch_user_id<>p_broadcaster and not coalesce(banned,false) and not coalesce(participation_restricted,false);
 end if;
 update public.rewards_boss_presence_state set broadcaster=p_broadcaster,observed_at=p_at,active=p_active,run_id=b.id where id=1;
end$$;
create or replace function public.rewards_live_boost_sample(p_broadcaster text,p_at timestamptz,p_active boolean,p_viewers text[]) returns void
language plpgsql set search_path='' as $$
declare s public.rewards_live_boost_state; stamp timestamptz:=clock_timestamp();
begin
 if p_at is null or abs(extract(epoch from(p_at-stamp)))>90 or p_active is null or p_viewers is null or cardinality(p_viewers)>50000 then raise exception 'invalid_sample';end if;
 if not exists(select 1 from public.rewards_streamers where twitch_broadcaster_id=p_broadcaster and is_primary and enabled) then raise exception 'primary_required';end if;
 select * into s from public.rewards_live_boost_state where id=1 for update;
 if s.observed_at is not null and p_at<=s.observed_at then return;end if;
 delete from public.rewards_live_boost_viewers where observed_at<=p_at;
 p_active:=p_active and s.enabled and stamp<s.trial_until and exists(select 1 from public.rewards_clan_chat_channels where broadcaster=p_broadcaster and authorized_at is not null and last_error is null);
 update public.rewards_live_boost_state set broadcaster=p_broadcaster,observed_at=p_at,active=p_active where id=1;
 if p_active then
  insert into public.rewards_live_boost_viewers(user_id,observed_at)
  select u.id,p_at from public.rewards_users u where u.twitch_user_id=any(p_viewers) and u.twitch_user_id<>p_broadcaster and not coalesce(u.banned,false) and not coalesce(u.participation_restricted,false);
 end if;
end$$;
notify pgrst,'reload schema';
