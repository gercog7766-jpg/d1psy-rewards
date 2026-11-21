create table public.rewards_boss_runs(
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('dropsy','guardian','titan')),
 max_hp int not null check(max_hp>0), hp int not null check(hp>=0 and hp<=max_hp),
 coins int not null check(coins between 0 and 100000), xp int not null check(xp between 0 and 1000000),
 status text not null check(status in ('active','paused','review','paid')),
 active_since timestamptz, elapsed_seconds bigint not null default 0, created_at timestamptz not null default now()
);
create unique index rewards_boss_one_open on public.rewards_boss_runs((true)) where status<>'paid';
create table public.rewards_boss_hits(
 id uuid primary key default gen_random_uuid(), run_id uuid not null references public.rewards_boss_runs(id),
 user_id uuid references public.rewards_users(id), source text not null check(source in ('free','subscription','gift','donationalerts','ihaq')),
 event_id text not null, donor text, amount_rub numeric, damage int not null check(damage>0),
 active_second bigint not null, created_at timestamptz not null default now(), unique(source,event_id)
);
create index rewards_boss_hits_run_user on public.rewards_boss_hits(run_id,user_id);
create table public.rewards_boss_awards(
 run_id uuid references public.rewards_boss_runs(id), user_id uuid references public.rewards_users(id),
 damage int not null, coins int not null, xp int not null, primary key(run_id,user_id)
);
create table public.rewards_live_achievement_progress(
 user_id uuid primary key references public.rewards_users(id), messages bigint not null default 0,
 seconds bigint not null default 0, bosses bigint not null default 0,
 last_message_at timestamptz, last_message_hash text, last_sample timestamptz
);
create table public.rewards_live_message_receipts(id text primary key, created_at timestamptz not null default now());
do $$declare t text;begin foreach t in array array['rewards_boss_runs','rewards_boss_hits','rewards_boss_awards','rewards_live_achievement_progress','rewards_live_message_receipts'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to service_role',t);
end loop;end$$;
create function public.rewards_boss_control(p_actor text,p_action text,p_body jsonb default '{}') returns jsonb
language plpgsql set search_path='' as $$
declare b public.rewards_boss_runs; k text; h int; c int; x int; stamp timestamptz:=clock_timestamp(); a record; target uuid;
begin
 if not exists(select 1 from public.rewards_streamers where is_primary and enabled and twitch_broadcaster_id=p_actor) then raise exception 'owner_required';end if;
 perform pg_advisory_xact_lock(78104921);
 select * into b from public.rewards_boss_runs where status<>'paid' for update;
 if p_action='start' then
  if b.id is not null then raise exception 'boss_exists';end if;
  k:=p_body->>'kind'; h:=case k when 'dropsy' then 5000 when 'guardian' then 10000 when 'titan' then 25000 end;
  if h is null then raise exception 'invalid_kind';end if;
  c:=coalesce((p_body->>'coins')::int,h/10); x:=coalesce((p_body->>'xp')::int,h/2);
  insert into public.rewards_boss_runs(kind,max_hp,hp,coins,xp,status,active_since) values(k,h,h,c,x,'active',stamp) returning * into b;
 elsif b.id is null then raise exception 'no_boss';
 elsif p_action='pause' and b.status='active' then
  update public.rewards_boss_runs set status='paused',elapsed_seconds=elapsed_seconds+greatest(0,floor(extract(epoch from stamp-active_since))::bigint),active_since=null where id=b.id;
 elsif p_action='resume' and b.status='paused' then
  update public.rewards_boss_runs set status='active',active_since=stamp where id=b.id;
 elsif p_action='identify' and b.status in ('active','paused','review') then
  if nullif(p_body->>'login','') is not null then
   select id into target from public.rewards_users where lower(twitch_login)=lower(p_body->>'login') and not coalesce(banned,false) and not coalesce(participation_restricted,false);
   if target is null then raise exception 'unknown_user';end if;
  end if;
  update public.rewards_boss_hits set user_id=target where run_id=b.id and id=(p_body->>'hitId')::uuid and source in ('donationalerts','ihaq');
  if not found then raise exception 'unknown_hit';end if;
 elsif p_action='pay' and b.status='review' then
  for a in select h.user_id,sum(h.damage)::int damage from public.rewards_boss_hits h join public.rewards_users u on u.id=h.user_id where h.run_id=b.id and not coalesce(u.banned,false) and not coalesce(u.participation_restricted,false) group by h.user_id order by h.user_id loop
   c:=floor(b.coins::numeric*a.damage/b.max_hp);x:=floor(b.xp::numeric*a.damage/b.max_hp);
   insert into public.rewards_boss_awards values(b.id,a.user_id,a.damage,c,x);
   if c>0 then insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(a.user_id,c,'adjustment','LIVE BOSS · '||b.id);end if;
   if x>0 then perform public.rewards_award_xp(a.user_id,x,'LIVE BOSS','boss_reward',b.id::text);end if;
   if a.damage>=150 then insert into public.rewards_live_achievement_progress(user_id,bosses) values(a.user_id,1) on conflict(user_id) do update set bosses=rewards_live_achievement_progress.bosses+1;end if;
  end loop;
  update public.rewards_boss_runs set status='paid' where id=b.id;
 else raise exception 'invalid_action';end if;
 return jsonb_build_object('ok',true,'id',b.id);
end$$;
create function public.rewards_boss_hit(p_source text,p_event text,p_actor text,p_donor text default null,p_rub numeric default null,p_gifts int default 1,p_code uuid default null) returns jsonb
language plpgsql set search_path='' as $$
declare b public.rewards_boss_runs; u uuid; dmg int; sec bigint; stamp timestamptz:=clock_timestamp(); prev bigint;
begin
 if p_event is null or length(p_event)>200 or p_source not in ('free','subscription','gift','donationalerts','ihaq') then raise exception 'invalid_event';end if;
 perform pg_advisory_xact_lock(78104921);
 if exists(select 1 from public.rewards_boss_hits where source=p_source and event_id=p_event) then return '{"duplicate":true}';end if;
 select * into b from public.rewards_boss_runs where status='active' for update;
 if b.id is null then raise exception 'boss_inactive';end if;
 sec:=b.elapsed_seconds+greatest(0,floor(extract(epoch from stamp-b.active_since))::bigint);
 if p_source in ('free','subscription','gift') then
  select id into u from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false) and not coalesce(participation_restricted,false);
  if p_source='free' then
   if u is null then raise exception 'user_required';end if;
   select max(active_second) into prev from public.rewards_boss_hits where run_id=b.id and user_id=u and source='free';
   if prev is not null and sec-prev<1800 then raise exception 'cooldown';end if;
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
 insert into public.rewards_boss_hits(run_id,user_id,source,event_id,donor,amount_rub,damage,active_second) values(b.id,u,p_source,p_event,left(p_donor,100),p_rub,dmg,sec);
 update public.rewards_boss_runs set hp=hp-dmg,status=case when hp=dmg then 'review' else status end,elapsed_seconds=case when hp=dmg then sec else elapsed_seconds end,active_since=case when hp=dmg then null else active_since end where id=b.id;
 return jsonb_build_object('damage',dmg,'hp',b.hp-dmg);
end$$;
create function public.rewards_live_chat_achievement(p_broadcaster text,p_actor text,p_id text,p_message text,p_at timestamptz) returns void
language plpgsql set search_path='' as $$
declare u uuid; digest text; begin
 if not exists(select 1 from public.rewards_streamers where is_primary and enabled and twitch_broadcaster_id=p_broadcaster) or p_actor=p_broadcaster or length(trim(p_message))<3 or left(trim(p_message),1) in ('!','/') then return;end if;
 select id into u from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false) and not coalesce(participation_restricted,false);if u is null then return;end if;
 insert into public.rewards_live_message_receipts values(p_id,p_at) on conflict do nothing;if not found then return;end if;
 digest:=md5(lower(trim(p_message)));
 insert into public.rewards_live_achievement_progress(user_id,messages,last_message_at,last_message_hash) values(u,1,p_at,digest)
 on conflict(user_id) do update set messages=rewards_live_achievement_progress.messages+1,last_message_at=p_at,last_message_hash=digest
 where (rewards_live_achievement_progress.last_message_at is null or rewards_live_achievement_progress.last_message_at<=p_at-interval '10 seconds') and rewards_live_achievement_progress.last_message_hash is distinct from digest;
end$$;
create function public.rewards_live_time_achievement(p_broadcaster text,p_viewers text[],p_at timestamptz) returns void
language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.rewards_streamers where is_primary and enabled and twitch_broadcaster_id=p_broadcaster) or cardinality(p_viewers)>50000 then return;end if;
 insert into public.rewards_live_achievement_progress(user_id,last_sample) select id,p_at from public.rewards_users where twitch_user_id=any(p_viewers) and twitch_user_id<>p_broadcaster and not coalesce(banned,false) and not coalesce(participation_restricted,false)
 on conflict(user_id) do update set seconds=rewards_live_achievement_progress.seconds+case when p_at-rewards_live_achievement_progress.last_sample between interval '1 minute' and interval '6 minutes' then least(300,floor(extract(epoch from p_at-rewards_live_achievement_progress.last_sample))::int) else 0 end,last_sample=p_at
 where rewards_live_achievement_progress.last_sample is null or p_at>rewards_live_achievement_progress.last_sample;
end$$;
revoke all on function public.rewards_boss_control(text,text,jsonb),public.rewards_boss_hit(text,text,text,text,numeric,int,uuid),public.rewards_live_chat_achievement(text,text,text,text,timestamptz),public.rewards_live_time_achievement(text,text[],timestamptz) from public,anon,authenticated;
grant execute on function public.rewards_boss_control(text,text,jsonb),public.rewards_boss_hit(text,text,text,text,numeric,int,uuid),public.rewards_live_chat_achievement(text,text,text,text,timestamptz),public.rewards_live_time_achievement(text,text[],timestamptz) to service_role;
notify pgrst,'reload schema';
