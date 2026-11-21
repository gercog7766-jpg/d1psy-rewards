-- Seven-day primary-channel-only pilot. Presence is verified chat membership,
-- not playback time; coins, Battle Pass, CXP and CP are unchanged.
create table public.rewards_live_boost_state(
 id int primary key check(id=1),enabled boolean not null default true,
 trial_until timestamptz not null default (clock_timestamp()+interval '7 days'),
 broadcaster text,observed_at timestamptz,active boolean not null default false
);
insert into public.rewards_live_boost_state(id) values(1);
create table public.rewards_live_boost_viewers(
 user_id uuid primary key references public.rewards_users(id),observed_at timestamptz not null
);
create table public.rewards_live_boost_remainders(
 user_id uuid primary key references public.rewards_users(id),remainder int not null check(remainder between 0 and 3)
);
do $$declare t text;begin foreach t in array array['rewards_live_boost_state','rewards_live_boost_viewers','rewards_live_boost_remainders'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to service_role',t);
end loop;end$$;
create function public.rewards_live_boost_sample(p_broadcaster text,p_at timestamptz,p_active boolean,p_viewers text[]) returns void
language plpgsql set search_path='' as $$
declare s public.rewards_live_boost_state; stamp timestamptz:=clock_timestamp();
begin
 if p_at is null or abs(extract(epoch from(p_at-stamp)))>90 or p_active is null or p_viewers is null or cardinality(p_viewers)>50000 then raise exception 'invalid_sample';end if;
 if not exists(select 1 from public.rewards_streamers where twitch_broadcaster_id=p_broadcaster and is_primary and enabled) then raise exception 'primary_required';end if;
 select * into s from public.rewards_live_boost_state where id=1 for update;
 if s.observed_at is not null and p_at<=s.observed_at then return;end if;
 delete from public.rewards_live_boost_viewers;
 p_active:=p_active and s.enabled and stamp<s.trial_until and exists(select 1 from public.rewards_clan_chat_channels where broadcaster=p_broadcaster and authorized_at is not null and last_error is null);
 update public.rewards_live_boost_state set broadcaster=p_broadcaster,observed_at=p_at,active=p_active where id=1;
 if p_active then
  insert into public.rewards_live_boost_viewers(user_id,observed_at)
  select u.id,p_at from public.rewards_users u where u.twitch_user_id=any(p_viewers) and u.twitch_user_id<>p_broadcaster and not coalesce(u.banned,false) and not coalesce(u.participation_restricted,false);
 end if;
end$$;
create function public.rewards_live_boost_status(p_actor text) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('live',coalesce(s.enabled and s.active and s.trial_until>now() and s.observed_at>now()-interval '6 minutes' and c.twitch_broadcaster_id is not null,false),
 'eligible',coalesce(s.enabled and s.active and s.trial_until>now() and s.observed_at>now()-interval '6 minutes' and c.twitch_broadcaster_id is not null and v.user_id is not null,false),
 'login',c.twitch_login,'trialUntil',s.trial_until)
 from public.rewards_live_boost_state s
 left join public.rewards_streamers c on c.twitch_broadcaster_id=s.broadcaster and c.is_primary and c.enabled
   and exists(select 1 from public.rewards_clan_chat_channels h where h.broadcaster=c.twitch_broadcaster_id and h.authorized_at is not null and h.last_error is null)
 left join public.rewards_users u on u.twitch_user_id=p_actor and not coalesce(u.banned,false) and not coalesce(u.participation_restricted,false)
 left join public.rewards_live_boost_viewers v on v.user_id=u.id and v.observed_at=s.observed_at
 where s.id=1
$$;
create function public.rewards_live_boost_award() returns trigger language plpgsql set search_path='' as $$
declare old_remainder int; bonus int; total int; stamp timestamptz:=clock_timestamp();
begin
 -- Exclude all administrative corrections, fixed seasonal grants, and
 -- Twitch/chat attendance rewards; only ordinary site XP earns the boost.
 if new.amount<=0 or new.source_type is null or new.source_type in('live_boost','season_reward','giveaway_win')
   or lower(new.source_type)~'(^admin|manual|adjustment|chat|watch|stream|attendance)' then return new;end if;
 if not exists(select 1 from public.rewards_live_boost_state s
  join public.rewards_live_boost_viewers v on v.observed_at=s.observed_at and v.user_id=new.user_id
  join public.rewards_streamers c on c.twitch_broadcaster_id=s.broadcaster and c.is_primary and c.enabled
  join public.rewards_clan_chat_channels h on h.broadcaster=c.twitch_broadcaster_id and h.authorized_at is not null and h.last_error is null
  where s.id=1 and s.enabled and s.active and s.trial_until>stamp and s.observed_at>stamp-interval '6 minutes') then return new;end if;
 perform 1 from public.rewards_users where id=new.user_id and not coalesce(banned,false) and not coalesce(participation_restricted,false) for update;
 if not found then return new;end if;
 insert into public.rewards_live_boost_remainders(user_id,remainder) values(new.user_id,0) on conflict do nothing;
 select remainder into old_remainder from public.rewards_live_boost_remainders where user_id=new.user_id for update;
 total:=new.amount+old_remainder;bonus:=total/4;
 update public.rewards_live_boost_remainders set remainder=mod(total,4) where user_id=new.user_id;
 if bonus>0 then
  insert into public.rewards_xp_history(user_id,amount,reason,source_type,source_id)
  values(new.user_id,bonus,'LIVE BOOST · +25% XP','live_boost',new.id::text) on conflict(user_id,source_type,source_id) do nothing;
  if found then update public.rewards_users set xp_total=xp_total+bonus where id=new.user_id;end if;
 end if;
 return new;
end$$;
create trigger rewards_live_boost_xp after insert on public.rewards_xp_history for each row execute function public.rewards_live_boost_award();
revoke all on function public.rewards_live_boost_sample(text,timestamptz,boolean,text[]),public.rewards_live_boost_status(text),public.rewards_live_boost_award() from public,anon,authenticated;
grant execute on function public.rewards_live_boost_sample(text,timestamptz,boolean,text[]),public.rewards_live_boost_status(text),public.rewards_live_boost_award() to service_role;
notify pgrst,'reload schema';
