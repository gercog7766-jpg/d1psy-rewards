-- Independent of the temporary LIVE BOOST pilot.
create table public.rewards_boss_presence_state(
 id int primary key check(id=1),broadcaster text,observed_at timestamptz,active boolean not null default false,run_id uuid references public.rewards_boss_runs(id)
);
insert into public.rewards_boss_presence_state(id) values(1);
create table public.rewards_boss_presence_viewers(
 user_id uuid primary key references public.rewards_users(id),observed_at timestamptz not null
);
create table public.rewards_boss_cooldowns(
 run_id uuid not null references public.rewards_boss_runs(id),user_id uuid not null references public.rewards_users(id),
 remaining_seconds int not null check(remaining_seconds between 0 and 1800),last_attack_at timestamptz not null,primary key(run_id,user_id)
);
do $$declare t text;begin foreach t in array array['rewards_boss_presence_state','rewards_boss_presence_viewers','rewards_boss_cooldowns'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to service_role',t);
end loop;end$$;
-- Keep the already elapsed portion of the old cooldown; new time is presence-only.
insert into public.rewards_boss_cooldowns(run_id,user_id,remaining_seconds,last_attack_at)
select b.id,h.user_id,greatest(0,least(1800,1800-(b.elapsed_seconds+case when b.status='active' then greatest(0,floor(extract(epoch from clock_timestamp()-b.active_since))::bigint) else 0 end-max(h.active_second))))::int,max(h.created_at)
from public.rewards_boss_runs b join public.rewards_boss_hits h on h.run_id=b.id
where b.status in ('active','paused','parked') and h.source='free' and h.user_id is not null group by b.id,h.user_id;
create function public.rewards_boss_presence_eligible(p_user uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from public.rewards_boss_presence_state s
 join public.rewards_boss_presence_viewers v on v.observed_at=s.observed_at and v.user_id=p_user
 join public.rewards_streamers c on c.twitch_broadcaster_id=s.broadcaster and c.is_primary and c.enabled
 join public.rewards_clan_chat_channels h on h.broadcaster=c.twitch_broadcaster_id and h.authorized_at is not null and h.last_error is null
 where s.id=1 and s.active and s.observed_at>now()-interval '6 minutes')
$$;
create function public.rewards_boss_presence_sample(p_broadcaster text,p_at timestamptz,p_active boolean,p_viewers text[]) returns void
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
 delete from public.rewards_boss_presence_viewers;
 if p_active then
  insert into public.rewards_boss_presence_viewers(user_id,observed_at)
  select id,p_at from public.rewards_users where twitch_user_id=any(p_viewers) and twitch_user_id<>p_broadcaster and not coalesce(banned,false) and not coalesce(participation_restricted,false);
 end if;
 update public.rewards_boss_presence_state set broadcaster=p_broadcaster,observed_at=p_at,active=p_active,run_id=b.id where id=1;
end$$;
create function public.rewards_boss_presence_status(p_actor text,p_run uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('present',coalesce(public.rewards_boss_presence_eligible(u.id),false),
 'cooldown',coalesce(c.remaining_seconds,0),'login',s.twitch_login,
 'live',coalesce(p.active and p.observed_at>now()-interval '6 minutes' and h.broadcaster is not null,false))
 from public.rewards_users u
 left join public.rewards_boss_cooldowns c on c.user_id=u.id and c.run_id=p_run
 left join public.rewards_streamers s on s.is_primary and s.enabled
 left join public.rewards_boss_presence_state p on p.id=1 and p.broadcaster=s.twitch_broadcaster_id
 left join public.rewards_clan_chat_channels h on h.broadcaster=s.twitch_broadcaster_id and h.authorized_at is not null and h.last_error is null
 where u.twitch_user_id=p_actor and not coalesce(u.banned,false) and not coalesce(u.participation_restricted,false)
 limit 1
$$;
create or replace function public.rewards_boss_hit(p_source text,p_event text,p_actor text,p_donor text default null,p_rub numeric default null,p_gifts int default 1,p_code uuid default null,p_at timestamptz default null,p_confirmed boolean default true) returns jsonb
language plpgsql set search_path='' as $$
declare b public.rewards_boss_runs; u uuid; dmg int; sec bigint; stamp timestamptz:=clock_timestamp(); prev bigint;
begin
 if p_event is null or length(p_event)>200 or p_source not in ('free','subscription','gift','donationalerts','ihaq') then raise exception 'invalid_event';end if;
 perform pg_advisory_xact_lock(78104921);
 if exists(select 1 from public.rewards_boss_hits where source=p_source and event_id=p_event) then return '{"duplicate":true}';end if;
 select * into b from public.rewards_boss_runs where status='active' for update;
 if b.id is null then raise exception 'boss_inactive';end if;
 if p_at is not null and (p_at<b.active_since or p_at>stamp+interval '30 seconds') then raise exception 'event_outside_battle';end if;
 sec:=b.elapsed_seconds+greatest(0,floor(extract(epoch from stamp-b.active_since))::bigint);
 if p_source in ('free','subscription','gift') then
  select id into u from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false) and not coalesce(participation_restricted,false);
  if p_source='free' then
   if u is null then raise exception 'user_required';end if;
   if not public.rewards_boss_presence_eligible(u) then raise exception 'stream_presence_required';end if;
   select remaining_seconds into prev from public.rewards_boss_cooldowns where run_id=b.id and user_id=u;
   if coalesce(prev,0)>0 then raise exception 'cooldown';end if;
   dmg:=40;
  elsif p_source='subscription' then dmg:=150;
  else if p_gifts not between 1 and 1000 then raise exception 'invalid_gifts';end if;dmg:=150*p_gifts;end if;
 else
  if p_rub is null or p_rub<=0 or p_rub>10000000 then raise exception 'invalid_amount';end if;
  select id into u from public.rewards_users where (id=p_code or (p_code is null and lower(twitch_login)=lower(p_donor))) and not coalesce(banned,false) and not coalesce(participation_restricted,false);
  if u is null and p_code is not null then select id into u from public.rewards_users where lower(twitch_login)=lower(p_donor) and not coalesce(banned,false) and not coalesce(participation_restricted,false);end if;
  dmg:=floor(p_rub*2);
 end if;
 dmg:=least(dmg,b.hp);if dmg<=0 then raise exception 'invalid_damage';end if;
 insert into public.rewards_boss_hits(run_id,user_id,source,event_id,donor,amount_rub,damage,active_second,confirmed) values(b.id,u,p_source,p_event,left(p_donor,100),p_rub,dmg,sec,p_confirmed);
 if p_source='free' then insert into public.rewards_boss_cooldowns(run_id,user_id,remaining_seconds,last_attack_at) values(b.id,u,1800,stamp) on conflict(run_id,user_id) do update set remaining_seconds=1800,last_attack_at=stamp;end if;
 update public.rewards_boss_runs set hp=hp-dmg,status=case when hp=dmg then 'review' else status end,elapsed_seconds=case when hp=dmg then sec else elapsed_seconds end,active_since=case when hp=dmg then null else active_since end where id=b.id;
 return jsonb_build_object('damage',dmg,'hp',b.hp-dmg);
end$$;
revoke all on function public.rewards_boss_presence_eligible(uuid),public.rewards_boss_presence_sample(text,timestamptz,boolean,text[]),public.rewards_boss_presence_status(text,uuid) from public,anon,authenticated;
grant execute on function public.rewards_boss_presence_eligible(uuid),public.rewards_boss_presence_sample(text,timestamptz,boolean,text[]),public.rewards_boss_presence_status(text,uuid) to service_role;
notify pgrst,'reload schema';
