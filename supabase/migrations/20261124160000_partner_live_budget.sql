-- Partner features share the existing wallet and lock its profile row before spending.
-- Existing giveaway reservations and primary-channel rewards remain unchanged.
create table public.rewards_partner_live_settings(
 broadcaster_id text primary key references public.rewards_streamer_live_profiles(broadcaster_id),
 rewards_enabled boolean not null default false
);
alter table public.rewards_partner_live_settings enable row level security;
revoke all on public.rewards_partner_live_settings from public,anon,authenticated;
grant select,insert,update on public.rewards_partner_live_settings to service_role;

create function public.rewards_partner_live_settings_api(p_actor text,p_enabled boolean default null) returns jsonb
language plpgsql set search_path='' as $$
declare balance bigint; enabled boolean;
begin
 perform 1 from public.rewards_streamer_live_profiles where broadcaster_id=p_actor and status='approved' for update;
 if not found then raise exception 'approval_required';end if;
 if p_enabled is not null then
  insert into public.rewards_partner_live_settings values(p_actor,p_enabled)
  on conflict(broadcaster_id) do update set rewards_enabled=excluded.rewards_enabled;
 end if;
 select coalesce(sum(amount),0) into balance from public.rewards_streamer_live_ledger where broadcaster_id=p_actor;
 select rewards_enabled into enabled from public.rewards_partner_live_settings where broadcaster_id=p_actor;
 return jsonb_build_object('balance',balance,'rewardsEnabled',coalesce(enabled,false),'authorized',exists(select 1 from public.rewards_clan_chat_channels where broadcaster=p_actor and authorized_at is not null and last_error is null),
 'bossReserved',(select coalesce(sum(coins),0) from public.rewards_partner_boss_runs where broadcaster_id=p_actor and status in ('active','paused','review')),
 'history',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') from (select amount,kind,actor,created_at from public.rewards_streamer_live_ledger where broadcaster_id=p_actor order by created_at desc limit 20)x));
end$$;
revoke all on function public.rewards_partner_live_settings_api(text,boolean) from public,anon,authenticated;
grant execute on function public.rewards_partner_live_settings_api(text,boolean) to service_role;

create function public.rewards_partner_live_reserve(p_channel text,p_amount bigint,p_request uuid,p_actor text) returns boolean
language plpgsql set search_path='' as $$
declare balance bigint;
begin
 if p_amount<0 or p_request is null then raise exception 'invalid_amount';end if;
 perform 1 from public.rewards_streamer_live_profiles where broadcaster_id=p_channel and status='approved' for update;
 if not found then return false;end if;
 if p_amount=0 then return true;end if;
 select coalesce(sum(amount),0) into balance from public.rewards_streamer_live_ledger where broadcaster_id=p_channel;
 if balance<p_amount then return false;end if;
 insert into public.rewards_streamer_live_ledger(broadcaster_id,amount,kind,request_id,actor) values(p_channel,-p_amount,'reserve',p_request,p_actor);
 return true;
end$$;
revoke all on function public.rewards_partner_live_reserve(text,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.rewards_partner_live_reserve(text,bigint,uuid,text) to service_role;

-- Wallet-specific carry prevents one channel from paying for activity on another.
create table public.rewards_live_economy_wallet_progress(user_id uuid references public.rewards_users(id),broadcaster text,seconds int not null check(seconds between 0 and 3599),messages int not null check(messages between 0 and 99),primary key(user_id,broadcaster));
alter table public.rewards_live_economy_wallet_progress enable row level security;
revoke all on public.rewards_live_economy_wallet_progress from public,anon,authenticated;
grant select,insert,update on public.rewards_live_economy_wallet_progress to service_role;
insert into public.rewards_live_economy_wallet_progress select t.user_id,s.twitch_broadcaster_id,(t.seconds%3600)::int,(t.messages%100)::int from public.rewards_live_economy_totals t cross join public.rewards_streamers s where s.is_primary and s.enabled on conflict do nothing;
create or replace function public.rewards_live_economy_credit(p_user uuid,p_day date,p_channel text,p_seconds int,p_messages int) returns void language plpgsql set search_path='' as $$
declare t public.rewards_live_economy_totals; time_reward int;chat_reward int;streak_reward int:=0;day_seconds bigint;next_streak int;badge text; progress public.rewards_live_economy_wallet_progress; primary_channel boolean;
begin
 if p_seconds not between 0 and 300 or p_messages not between 0 and 1 then raise exception 'invalid_credit';end if;
 primary_channel:=exists(select 1 from public.rewards_streamers where is_primary and enabled and twitch_broadcaster_id=p_channel);
 if not primary_channel then
  perform 1 from public.rewards_streamer_live_profiles where broadcaster_id=p_channel and status='approved' for update;
  if not found or not exists(select 1 from public.rewards_partner_live_settings where broadcaster_id=p_channel and rewards_enabled) then return;end if;
 end if;
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) and not coalesce(participation_restricted,false) for update;
 if not found then return;end if;
 insert into public.rewards_live_economy_totals(user_id) values(p_user) on conflict do nothing;
 select * into t from public.rewards_live_economy_totals where user_id=p_user for update;
 select * into progress from public.rewards_live_economy_wallet_progress where user_id=p_user and broadcaster=p_channel;
 time_reward:=((coalesce(progress.seconds,0)+p_seconds)/3600)*5;chat_reward:=((coalesce(progress.messages,0)+p_messages)/100)*2;
 if not primary_channel and not public.rewards_partner_live_reserve(p_channel,time_reward+chat_reward,gen_random_uuid(),'live_center') then return;end if;
 insert into public.rewards_live_economy_wallet_progress values(p_user,p_channel,(coalesce(progress.seconds,0)+p_seconds)%3600,(coalesce(progress.messages,0)+p_messages)%100) on conflict(user_id,broadcaster) do update set seconds=excluded.seconds,messages=excluded.messages;
 insert into public.rewards_live_economy_daily(user_id,day,broadcaster,seconds,messages,time_coins,chat_coins) values(p_user,p_day,p_channel,p_seconds,p_messages,time_reward,chat_reward)
 on conflict(user_id,day,broadcaster) do update set seconds=rewards_live_economy_daily.seconds+excluded.seconds,messages=rewards_live_economy_daily.messages+excluded.messages,time_coins=rewards_live_economy_daily.time_coins+excluded.time_coins,chat_coins=rewards_live_economy_daily.chat_coins+excluded.chat_coins;
 update public.rewards_live_economy_totals set seconds=seconds+p_seconds,messages=messages+p_messages where user_id=p_user;
 if time_reward>0 then insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user,time_reward,'adjustment','LIVE REWARDS · эфир · '||p_channel);end if;
 if chat_reward>0 then insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user,chat_reward,'adjustment','LIVE REWARDS · чат · '||p_channel);end if;
 if p_seconds>0 and (t.last_day is null or p_day>t.last_day) then
  select coalesce(sum(seconds),0) into day_seconds from public.rewards_live_economy_daily where user_id=p_user and day=p_day;
  if day_seconds>=3600 then
   next_streak:=case when t.last_day is not null and not exists(select 1 from public.rewards_live_economy_days where day>t.last_day and day<p_day and seconds>=3600) then t.streak+1 else 1 end;
   streak_reward:=public.rewards_live_economy_streak_reward(next_streak);
   badge:=case next_streak when 50 then 'LIVE STREAK 50' when 100 then 'LIVE STREAK 100' when 150 then 'LIVE STREAK 150' when 200 then 'LIVE STREAK 200' end;
   update public.rewards_live_economy_totals set streak=next_streak,best_streak=greatest(best_streak,next_streak),last_day=p_day where user_id=p_user;
   if streak_reward>0 then
    insert into public.rewards_live_economy_milestones values(p_user,p_day,next_streak,streak_reward,badge);
    insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user,streak_reward,'adjustment','LIVE STREAK · '||next_streak);
    update public.rewards_live_economy_daily set streak_coins=streak_coins+streak_reward where user_id=p_user and day=p_day and broadcaster=p_channel;
    if badge is not null then insert into public.rewards_profile_style(user_id,title) values(p_user,badge) on conflict(user_id) do update set title=excluded.title where rewards_profile_style.title is null or rewards_profile_style.title ~ '^LIVE STREAK [0-9]+$';end if;
   end if;
  end if;
 end if;
end$$;
-- A sample can include multiple partners. Lock their wallets before any viewer rows.
alter function public.rewards_live_economy_sample(timestamptz,jsonb) rename to rewards_live_economy_sample_original;
create or replace function public.rewards_live_economy_sample_original(p_at timestamptz,p_channels jsonb) returns void language plpgsql set search_path='' as $$
declare s public.rewards_live_economy_clock; c jsonb; item record; delta int; d date; lo timestamptz; a int; b int; has_live boolean;
begin
 if p_at is null or abs(extract(epoch from p_at-clock_timestamp()))>90 or jsonb_typeof(p_channels) is distinct from 'array' or jsonb_array_length(p_channels)>200 then raise exception 'invalid_sample';end if;
 perform pg_advisory_xact_lock(78104922);
 select * into s from public.rewards_live_economy_clock where id=1 for update;
 if s.observed_at is not null and p_at<=s.observed_at then return;end if;
 d:=(p_at at time zone 'Europe/Moscow')::date;lo:=d::timestamp at time zone 'Europe/Moscow';
 has_live:=exists(select 1 from jsonb_array_elements(p_channels) x where public.rewards_live_economy_approved(x->>'broadcaster') and x->>'live'='true');
 delta:=case when s.observed_at is not null and p_at-s.observed_at<=interval '6 minutes' then least(300,greatest(0,round(extract(epoch from p_at-s.observed_at))::int)) else 0 end;
 a:=least(delta,greatest(0,floor(extract(epoch from p_at-lo))::int));b:=delta-a;
 if has_live then
  insert into public.rewards_live_economy_days(day,seconds) values(d,case when s.live then a else 0 end) on conflict(day) do update set seconds=rewards_live_economy_days.seconds+excluded.seconds;
  if s.live and b>0 then insert into public.rewards_live_economy_days(day,seconds) values(d-1,b) on conflict(day) do update set seconds=rewards_live_economy_days.seconds+excluded.seconds;end if;
 end if;
 -- Confirm both ends of the interval on the same authorized channel, deduplicate across channels.
 for item in select distinct on(u.id) u.id,x->>'broadcaster' channel from jsonb_array_elements(p_channels) x cross join lateral jsonb_array_elements_text(case when jsonb_typeof(x->'viewers')='array' then x->'viewers' else '[]'::jsonb end) v(value)
 join public.rewards_users u on u.twitch_user_id=v.value join public.rewards_live_economy_presence p on p.user_id=u.id and p.broadcaster=x->>'broadcaster' and p.observed_at=s.observed_at
 where delta>0 and x->>'live'='true' and public.rewards_live_economy_approved(x->>'broadcaster') and u.twitch_user_id<>x->>'broadcaster' and exists(select 1 from public.rewards_clan_chat_channels h where h.broadcaster=x->>'broadcaster' and h.authorized_at is not null and h.last_error is null)
 and (exists(select 1 from public.rewards_streamers q where q.is_primary and q.enabled and q.twitch_broadcaster_id=x->>'broadcaster') or exists(select 1 from public.rewards_partner_live_settings q where q.broadcaster_id=x->>'broadcaster' and q.rewards_enabled))
 order by u.id,(exists(select 1 from public.rewards_streamers q where q.is_primary and q.enabled and q.twitch_broadcaster_id=x->>'broadcaster')) desc,x->>'broadcaster' loop
  if b>0 then perform public.rewards_live_economy_credit(item.id,d-1,item.channel,b,0);end if;
  if a>0 then perform public.rewards_live_economy_credit(item.id,d,item.channel,a,0);end if;
 end loop;
 delete from public.rewards_live_economy_presence where observed_at<=p_at;
 update public.rewards_live_economy_channels set live=false,observed_at=p_at where observed_at<p_at;
 for c in select value from jsonb_array_elements(p_channels) loop
  if not public.rewards_live_economy_approved(c->>'broadcaster') then continue;end if;
  insert into public.rewards_live_economy_channels values(c->>'broadcaster',p_at,coalesce(c->>'live'='true',false)) on conflict(broadcaster) do update set observed_at=excluded.observed_at,live=excluded.live where rewards_live_economy_channels.observed_at<=excluded.observed_at;
  if c->>'live'='true' and jsonb_typeof(c->'viewers')='array' and exists(select 1 from public.rewards_clan_chat_channels where broadcaster=c->>'broadcaster' and authorized_at is not null and last_error is null) then
   insert into public.rewards_live_economy_presence select u.id,c->>'broadcaster',p_at from public.rewards_users u where u.twitch_user_id in(select jsonb_array_elements_text(c->'viewers')) and u.twitch_user_id<>c->>'broadcaster' and not coalesce(u.banned,false) and not coalesce(u.participation_restricted,false) on conflict do nothing;
  end if;
 end loop;
 update public.rewards_live_economy_clock set observed_at=p_at,live=has_live where id=1;
end$$;
create function public.rewards_live_economy_sample(p_at timestamptz,p_channels jsonb) returns void
language plpgsql set search_path='' as $$
begin
 perform 1 from public.rewards_streamer_live_profiles where status='approved' order by broadcaster_id for update;
 perform public.rewards_partner_boss_sample(p_at,p_channels);
 perform public.rewards_live_economy_sample_original(p_at,p_channels);
end$$;
revoke all on function public.rewards_live_economy_sample(timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_live_economy_sample(timestamptz,jsonb) to service_role;

create table public.rewards_partner_boss_runs(
 id uuid primary key default gen_random_uuid(),
 broadcaster_id text not null references public.rewards_streamer_live_profiles(broadcaster_id),
 kind text not null default 'dropsy' check(kind in ('dropsy','guardian','titan')),
 max_hp int not null check(max_hp between 100 and 1000000),
 hp int not null check(hp between 0 and max_hp),
 coins int not null check(coins between 1 and 100000),
 status text not null check(status in ('active','paused','review','paid','cancelled')),
 created_at timestamptz not null default clock_timestamp(),
 active_since timestamptz,
 sample_at timestamptz,
 sample_live boolean not null default false,
 regen_seconds int not null default 0 check(regen_seconds between 0 and 59)
);
create unique index rewards_partner_boss_one_open on public.rewards_partner_boss_runs(broadcaster_id) where status in ('active','paused','review');
create table public.rewards_partner_boss_hits(
 run_id uuid not null references public.rewards_partner_boss_runs(id),
 user_id uuid references public.rewards_users(id),
 request_id uuid not null,
 damage int not null check(damage>0),
 hit_kind text not null check(hit_kind in ('normal','critical','multishot')),
 source text not null default 'free' check(source in ('free','subscription','gift','donationalerts','ihaq')),
 donor text,
 confirmed boolean not null default true,
 rejected boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),
 primary key(run_id,request_id)
);
create index rewards_partner_boss_hits_user on public.rewards_partner_boss_hits(run_id,user_id,created_at desc);
create table public.rewards_partner_boss_cooldowns(run_id uuid references public.rewards_partner_boss_runs(id),user_id uuid references public.rewards_users(id),remaining_seconds int not null check(remaining_seconds between 0 and 1800),last_attack_at timestamptz not null,primary key(run_id,user_id));
create table public.rewards_partner_boss_events(broadcaster_id text not null references public.rewards_streamer_live_profiles(broadcaster_id),source text not null,event_id text not null,primary key(broadcaster_id,source,event_id));
create table public.rewards_partner_boss_credentials(broadcaster_id text not null references public.rewards_streamer_live_profiles(broadcaster_id),provider text not null check(provider in ('donationalerts','ihaq')),ciphertext text not null,fingerprint text,primary key(broadcaster_id,provider));
create unique index rewards_partner_boss_ihaq_one_channel on public.rewards_partner_boss_credentials(fingerprint) where provider='ihaq';
do $$declare t text;begin foreach t in array array['rewards_partner_boss_runs','rewards_partner_boss_hits','rewards_partner_boss_cooldowns','rewards_partner_boss_events','rewards_partner_boss_credentials'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update on public.%I to service_role',t);
end loop;end$$;

create function public.rewards_partner_boss_settle(p_run uuid) returns void language plpgsql set search_path='' as $$
declare b public.rewards_partner_boss_runs; a record; paid int:=0; prize int; denominator numeric;
begin
 select * into b from public.rewards_partner_boss_runs where id=p_run and hp=0 and status='review' for update;
 if not found or exists(select 1 from public.rewards_partner_boss_hits where run_id=p_run and not confirmed and not rejected) then return;end if;
 select greatest(b.max_hp,coalesce(sum(h.damage),0)) into denominator from public.rewards_partner_boss_hits h where h.run_id=b.id and not h.rejected;
 for a in select h.user_id,sum(h.damage) as total from public.rewards_partner_boss_hits h join public.rewards_users v on v.id=h.user_id where h.run_id=b.id and not h.rejected and not coalesce(v.banned,false) and not coalesce(v.participation_restricted,false) group by h.user_id order by h.user_id loop
  prize:=floor(b.coins::numeric*a.total/denominator);
  if prize>0 then insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(a.user_id,prize,'adjustment','PARTNER LIVE BOSS · '||b.id);paid:=paid+prize;end if;
 end loop;
 if paid<b.coins then insert into public.rewards_streamer_live_ledger(broadcaster_id,amount,kind,request_id,actor) values(b.broadcaster_id,b.coins-paid,'refund',b.id,'live_boss');end if;
 update public.rewards_partner_boss_runs set status='paid' where id=b.id;
end$$;
revoke all on function public.rewards_partner_boss_settle(uuid) from public,anon,authenticated;
grant execute on function public.rewards_partner_boss_settle(uuid) to service_role;

create function public.rewards_partner_boss_control(p_actor text,p_action text,p_run uuid,p_hp int default null,p_coins int default null,p_kind text default 'dropsy') returns jsonb
language plpgsql set search_path='' as $$
declare b public.rewards_partner_boss_runs;
begin
 perform 1 from public.rewards_streamer_live_profiles where broadcaster_id=p_actor and status='approved' for update;
 if not found then raise exception 'approval_required';end if;
 if p_action='start' then
  if p_run is null or p_hp is null or p_hp not between 100 and 1000000 or p_coins is null or p_coins not between 1 and 100000 or p_kind not in ('dropsy','guardian','titan') then raise exception 'invalid_request';end if;
  select * into b from public.rewards_partner_boss_runs where id=p_run and broadcaster_id=p_actor;
  if found then
   if b.max_hp<>p_hp or b.coins<>p_coins or b.kind<>p_kind then raise exception 'request_conflict';end if;
   return to_jsonb(b);
  end if;
  if exists(select 1 from public.rewards_partner_boss_runs where broadcaster_id=p_actor and status in ('active','paused','review')) then raise exception 'boss_exists';end if;
  if not public.rewards_partner_live_reserve(p_actor,p_coins,p_run,'live_boss') then raise exception 'insufficient_budget';end if;
  insert into public.rewards_partner_boss_runs(id,broadcaster_id,kind,max_hp,hp,coins,status,active_since) values(p_run,p_actor,p_kind,p_hp,p_hp,p_coins,'active',clock_timestamp()) returning * into b;
 else
  select * into b from public.rewards_partner_boss_runs where id=p_run and broadcaster_id=p_actor for update;
  if not found then raise exception 'no_boss';end if;
  if p_action='pause' and b.status='active' then update public.rewards_partner_boss_runs set status='paused',active_since=null,sample_at=null,sample_live=false where id=b.id returning * into b;
  elsif p_action='resume' and b.status='paused' then update public.rewards_partner_boss_runs set status='active',active_since=clock_timestamp(),sample_at=null,sample_live=false where id=b.id returning * into b;
  elsif p_action='cancel' and b.status in ('active','paused') then
   if exists(select 1 from public.rewards_partner_boss_hits where run_id=b.id) then raise exception 'boss_has_hits';end if;
   insert into public.rewards_streamer_live_ledger(broadcaster_id,amount,kind,request_id,actor) values(p_actor,b.coins,'refund',b.id,'live_boss');
   update public.rewards_partner_boss_runs set status='cancelled' where id=b.id returning * into b;
  else raise exception 'invalid_action';end if;
 end if;
 return to_jsonb(b);
end$$;

create function public.rewards_partner_boss_attack(p_actor text,p_run uuid,p_request uuid) returns jsonb
language plpgsql set search_path='' as $$
declare b public.rewards_partner_boss_runs; u uuid; old_hit public.rewards_partner_boss_hits; hit_kind text:='normal'; damage int; roll int;
begin
 if p_request is null then raise exception 'invalid_request';end if;
 select * into b from public.rewards_partner_boss_runs where id=p_run;
 if not found then raise exception 'no_boss';end if;
 perform 1 from public.rewards_streamer_live_profiles where broadcaster_id=b.broadcaster_id and status='approved' for update;
 if not found then raise exception 'approval_required';end if;
 select * into b from public.rewards_partner_boss_runs where id=p_run for update;
 select id into u from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false) and not coalesce(participation_restricted,false);
 if u is null or p_actor=b.broadcaster_id then raise exception 'user_required';end if;
 select * into old_hit from public.rewards_partner_boss_hits where run_id=p_run and request_id=p_request;
 if found then
  if old_hit.user_id<>u then raise exception 'request_conflict';end if;
  return jsonb_build_object('damage',old_hit.damage,'kind',old_hit.hit_kind,'hp',b.hp);
 end if;
 if b.status<>'active' then raise exception 'boss_inactive';end if;
 if not exists(select 1 from public.rewards_live_economy_presence p join public.rewards_live_economy_channels c on c.broadcaster=p.broadcaster join public.rewards_clan_chat_channels h on h.broadcaster=p.broadcaster where p.user_id=u and p.broadcaster=b.broadcaster_id and p.observed_at>clock_timestamp()-interval '6 minutes' and c.live and c.observed_at>clock_timestamp()-interval '6 minutes' and h.authorized_at is not null and h.last_error is null) then raise exception 'stream_presence_required';end if;
 if exists(select 1 from public.rewards_partner_boss_cooldowns where run_id=b.id and user_id=u and remaining_seconds>0) then raise exception 'cooldown';end if;
 roll:=public.rewards_crypto_index(100);
 if roll<5 then damage:=90+public.rewards_crypto_index(21);hit_kind:='critical';
 else damage:=35+public.rewards_crypto_index(11);if roll=5 then hit_kind:='multishot';end if;end if;
 damage:=least(damage,b.hp);
 insert into public.rewards_partner_boss_hits(run_id,user_id,request_id,damage,hit_kind) values(b.id,u,p_request,damage,hit_kind);
 insert into public.rewards_partner_boss_cooldowns values(b.id,u,case when hit_kind='multishot' then 0 else 1800 end,clock_timestamp()) on conflict(run_id,user_id) do update set remaining_seconds=excluded.remaining_seconds,last_attack_at=excluded.last_attack_at;
 update public.rewards_partner_boss_runs set hp=hp-damage,status=case when hp=damage then 'review' else status end where id=b.id returning * into b;
 if b.hp=0 then perform public.rewards_partner_boss_settle(b.id);end if;
 return jsonb_build_object('damage',damage,'kind',hit_kind,'hp',b.hp);
end$$;
revoke all on function public.rewards_partner_boss_control(text,text,uuid,int,int,text),public.rewards_partner_boss_attack(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.rewards_partner_boss_control(text,text,uuid,int,int,text),public.rewards_partner_boss_attack(text,uuid,uuid) to service_role;

create function public.rewards_partner_boss_provider_hit(p_channel text,p_source text,p_event text,p_actor text default null,p_donor text default null,p_rub numeric default null,p_gifts int default 1,p_code uuid default null,p_at timestamptz default null) returns void language plpgsql set search_path='' as $$
declare b public.rewards_partner_boss_runs; u uuid; damage int; hit_kind text:='normal';
begin
 if p_source not in ('subscription','gift','donationalerts','ihaq') or p_event is null or length(p_event)>200 or p_at is null or p_at>clock_timestamp()+interval '30 seconds' then raise exception 'invalid_event';end if;
 perform 1 from public.rewards_streamer_live_profiles where broadcaster_id=p_channel and status='approved' for update;
 if not found then return;end if;
 select * into b from public.rewards_partner_boss_runs where broadcaster_id=p_channel and status='active' for update;
 if not found or p_at<b.active_since then return;end if;
 insert into public.rewards_partner_boss_events values(p_channel,p_source,p_event) on conflict do nothing;
 if not found then return;end if;
 if p_source in ('subscription','gift') then
  if p_gifts not between 1 and 1000 then raise exception 'invalid_event';end if;
  damage:=150*case when p_source='gift' then p_gifts else 1 end;
  select id into u from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false) and not coalesce(participation_restricted,false);
 else
  if p_rub is null or p_rub<0.5 or p_rub>10000000 then raise exception 'invalid_event';end if;
  if public.rewards_crypto_index(100)<50 then hit_kind:='critical';damage:=floor(p_rub*(250+public.rewards_crypto_index(151))/100);else damage:=floor(p_rub*2);end if;
  select id into u from public.rewards_users where (id=p_code or (p_code is null and lower(twitch_login)=lower(p_donor))) and not coalesce(banned,false) and not coalesce(participation_restricted,false);
 end if;
 damage:=least(damage,b.hp);
 insert into public.rewards_partner_boss_hits(run_id,user_id,request_id,damage,hit_kind,source,donor,confirmed) values(b.id,u,gen_random_uuid(),damage,hit_kind,p_source,left(p_donor,100),p_source in ('subscription','gift'));
 update public.rewards_partner_boss_runs set hp=hp-damage,status=case when hp=damage then 'review' else status end where id=b.id;
 if b.hp=damage then perform public.rewards_partner_boss_settle(b.id);end if;
end$$;
revoke all on function public.rewards_partner_boss_provider_hit(text,text,text,text,text,numeric,int,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.rewards_partner_boss_provider_hit(text,text,text,text,text,numeric,int,uuid,timestamptz) to service_role;

create function public.rewards_partner_boss_review(p_actor text,p_run uuid,p_hit uuid,p_confirm boolean,p_login text default null) returns void language plpgsql set search_path='' as $$
declare b public.rewards_partner_boss_runs; h public.rewards_partner_boss_hits; target uuid;
begin
 perform 1 from public.rewards_streamer_live_profiles where broadcaster_id=p_actor and status='approved' for update;
 if not found then raise exception 'approval_required';end if;
 select * into b from public.rewards_partner_boss_runs where id=p_run and broadcaster_id=p_actor and status in ('active','paused','review') for update;
 if not found then raise exception 'no_boss';end if;
 select * into h from public.rewards_partner_boss_hits where run_id=p_run and request_id=p_hit and not confirmed and not rejected for update;
 if not found then raise exception 'unknown_hit';end if;
 if p_confirm then
  if p_login is not null and p_login<>'' then select id into target from public.rewards_users where lower(twitch_login)=lower(p_login) and not coalesce(banned,false) and not coalesce(participation_restricted,false);if target is null then raise exception 'unknown_user';end if;end if;
  update public.rewards_partner_boss_hits set confirmed=true,user_id=coalesce(target,user_id) where run_id=p_run and request_id=p_hit;
  perform public.rewards_partner_boss_settle(p_run);
 else
  update public.rewards_partner_boss_hits set rejected=true where run_id=p_run and request_id=p_hit;
  update public.rewards_partner_boss_runs set hp=least(max_hp,hp+h.damage),status=case when status='review' then 'paused' else status end,active_since=case when status='review' then null else active_since end where id=p_run;
 end if;
end$$;
revoke all on function public.rewards_partner_boss_review(text,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.rewards_partner_boss_review(text,uuid,uuid,boolean,text) to service_role;

create function public.rewards_partner_boss_sample(p_at timestamptz,p_channels jsonb) returns void
language plpgsql set search_path='' as $$
declare b public.rewards_partner_boss_runs; channel jsonb; live boolean; seconds int; regen int;
begin
 if p_at is null or abs(extract(epoch from p_at-clock_timestamp()))>90 or jsonb_typeof(p_channels) is distinct from 'array' or jsonb_array_length(p_channels)>200 then raise exception 'invalid_sample';end if;
 for b in select r.* from public.rewards_partner_boss_runs r join public.rewards_streamer_live_profiles s on s.broadcaster_id=r.broadcaster_id and s.status='approved' where r.status='active' order by r.broadcaster_id for update of r loop
  if p_at<b.active_since or p_at<=b.sample_at then continue;end if;
  select x into channel from jsonb_array_elements(p_channels) x where x->>'broadcaster'=b.broadcaster_id limit 1;
  live:=coalesce(channel->>'live'='true',false);
  seconds:=case when live and b.sample_live and p_at-b.sample_at<=interval '6 minutes' then least(300,greatest(0,floor(extract(epoch from p_at-b.sample_at))::int)) else 0 end;
  regen:=case when b.hp<b.max_hp then b.regen_seconds+seconds else 0 end;
  update public.rewards_partner_boss_runs set hp=least(max_hp,hp+regen/60),regen_seconds=case when hp+regen/60>=max_hp then 0 else regen%60 end,sample_at=p_at,sample_live=live where id=b.id;
  if seconds>0 and jsonb_typeof(channel->'viewers')='array' then
   update public.rewards_partner_boss_cooldowns c set remaining_seconds=greatest(0,c.remaining_seconds-least(seconds,greatest(0,floor(extract(epoch from p_at-greatest(b.sample_at,c.last_attack_at,b.active_since)))::int)))
   from public.rewards_live_economy_presence p,public.rewards_users u where c.run_id=b.id and c.user_id=p.user_id and u.id=c.user_id and p.broadcaster=b.broadcaster_id and p.observed_at=b.sample_at and u.twitch_user_id in(select jsonb_array_elements_text(channel->'viewers'));
  end if;
 end loop;
end$$;
revoke all on function public.rewards_partner_boss_sample(timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_partner_boss_sample(timestamptz,jsonb) to service_role;

create function public.rewards_partner_boss_list(p_actor text default null,p_owner text default null,p_login text default null) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'broadcaster_id',b.broadcaster_id,'login',s.login,'kind',b.kind,'hp',b.hp,'max_hp',b.max_hp,'coins',b.coins,'status',b.status,
 'participants',(select count(distinct h.user_id) from public.rewards_partner_boss_hits h where h.run_id=b.id and not h.rejected),
 'cooldown',coalesce((select c.remaining_seconds from public.rewards_partner_boss_cooldowns c join public.rewards_users u on u.id=c.user_id where c.run_id=b.id and u.twitch_user_id=p_actor),0),
 'present',exists(select 1 from public.rewards_live_economy_presence p join public.rewards_users u on u.id=p.user_id join public.rewards_live_economy_channels c on c.broadcaster=p.broadcaster join public.rewards_clan_chat_channels h on h.broadcaster=p.broadcaster where u.twitch_user_id=p_actor and p.broadcaster=b.broadcaster_id and p.observed_at>now()-interval '6 minutes' and c.live and c.observed_at>now()-interval '6 minutes' and h.authorized_at is not null and h.last_error is null),
 'leaders',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select u.twitch_login login,sum(h.damage) damage from public.rewards_partner_boss_hits h join public.rewards_users u on u.id=h.user_id where h.run_id=b.id and not h.rejected group by u.twitch_login order by sum(h.damage) desc limit 10)x)) order by s.login),'[]')
 from public.rewards_partner_boss_runs b join public.rewards_streamer_live_profiles s on s.broadcaster_id=b.broadcaster_id and s.status='approved'
 where b.status in ('active','paused','review') and (p_owner is null or b.broadcaster_id=p_owner) and (p_login is null or s.login=p_login)
$$;
revoke all on function public.rewards_partner_boss_list(text,text,text) from public,anon,authenticated;
grant execute on function public.rewards_partner_boss_list(text,text,text) to service_role;
create or replace function public.rewards_live_economy_events() returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.login),'[]'::jsonb) from (
 select coalesce((select twitch_login from public.rewards_streamers where twitch_broadcaster_id=c.broadcaster limit 1),(select login from public.rewards_streamer_live_profiles where broadcaster_id=c.broadcaster)) login,
 exists(select 1 from public.rewards_streamer_live_rounds r where r.broadcaster_id=c.broadcaster and r.status='active') or exists(select 1 from public.rewards_rounds r where r.status='active' and (r.streamer_id in(select id from public.rewards_streamers where twitch_broadcaster_id=c.broadcaster) or r.streamer_id is null and exists(select 1 from public.rewards_streamers where twitch_broadcaster_id=c.broadcaster and is_primary and enabled))) giveaway,
 exists(select 1 from public.rewards_connect_sessions r join public.rewards_connect_settings z on z.broadcaster=r.broadcaster and z.enabled where r.broadcaster=c.broadcaster and r.ended_at is null and r.last_seen>now()-interval '2 minutes') drop,
 exists(select 1 from public.rewards_streamers where twitch_broadcaster_id=c.broadcaster and is_primary and enabled) and exists(select 1 from public.rewards_boss_runs where status='active' and not hidden) or exists(select 1 from public.rewards_partner_boss_runs r where r.broadcaster_id=c.broadcaster and r.status='active') boss
 from public.rewards_live_economy_channels c where c.live and c.observed_at>now()-interval '6 minutes' and public.rewards_live_economy_approved(c.broadcaster)
 ) x where x.giveaway or x.drop or x.boss
$$;
create or replace function public.rewards_live_economy_stats(p_actor text,p_period text,p_admin boolean default false) returns jsonb language plpgsql stable set search_path='' as $$
declare u uuid; d date:=(now() at time zone 'Europe/Moscow')::date; start_day date; t public.rewards_live_economy_totals; rows jsonb; totals jsonb; streak int;
begin
 if p_period not in('today','week','month','all') then raise exception 'invalid_period';end if;
 if p_admin and not exists(select 1 from public.rewards_admins where twitch_user_id=p_actor) then raise exception 'admin_required';end if;
 select id into u from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false);if not found then raise exception 'user_required';end if;
 start_day:=case p_period when 'today' then d when 'week' then date_trunc('week',d::timestamp)::date when 'month' then date_trunc('month',d::timestamp)::date else date '2000-01-01' end;
 select * into t from public.rewards_live_economy_totals where user_id=u;
 select jsonb_build_object('seconds',coalesce(sum(seconds),0),'messages',coalesce(sum(messages),0),'timeCoins',coalesce(sum(time_coins),0),'chatCoins',coalesce(sum(chat_coins),0),'streakCoins',coalesce(sum(streak_coins),0)) into totals from public.rewards_live_economy_daily where day>=start_day and (p_admin or user_id=u);
 select coalesce(jsonb_agg(to_jsonb(x) order by x.seconds desc,x.broadcaster),'[]') into rows from(select q.broadcaster,coalesce((select twitch_login from public.rewards_streamers where twitch_broadcaster_id=q.broadcaster limit 1),(select login from public.rewards_streamer_live_profiles where broadcaster_id=q.broadcaster),q.broadcaster) login,sum(q.seconds) seconds,sum(q.messages) messages,sum(q.time_coins) "timeCoins",sum(q.chat_coins) "chatCoins",sum(q.streak_coins) "streakCoins",count(distinct q.user_id) viewers from public.rewards_live_economy_daily q where q.day>=start_day and (p_admin or q.user_id=u) group by q.broadcaster)x;
 streak:=case when t.last_day is not null and exists(select 1 from public.rewards_live_economy_days where day>t.last_day and day<d and seconds>=3600) then 0 else coalesce(t.streak,0) end;
 return jsonb_build_object('totals',totals,'channels',rows,'progressByChannel',(select coalesce(jsonb_agg(jsonb_build_object('login',coalesce((select twitch_login from public.rewards_streamers where twitch_broadcaster_id=p.broadcaster limit 1),(select login from public.rewards_streamer_live_profiles where broadcaster_id=p.broadcaster),p.broadcaster),'seconds',p.seconds,'messages',p.messages) order by p.broadcaster),'[]') from public.rewards_live_economy_wallet_progress p where p.user_id=u),'timeProgress',coalesce((select p.seconds from public.rewards_live_economy_wallet_progress p join public.rewards_streamers s on s.twitch_broadcaster_id=p.broadcaster and s.is_primary and s.enabled where p.user_id=u limit 1),0),'messageProgress',coalesce((select p.messages from public.rewards_live_economy_wallet_progress p join public.rewards_streamers s on s.twitch_broadcaster_id=p.broadcaster and s.is_primary and s.enabled where p.user_id=u limit 1),0),'streak',streak,'bestStreak',coalesce(t.best_streak,0),'todaySeconds',(select coalesce(sum(seconds),0) from public.rewards_live_economy_daily where user_id=u and day=d),'milestones',(select coalesce(jsonb_agg(to_jsonb(m)-'user_id' order by day desc),'[]') from public.rewards_live_economy_milestones m where user_id=u));
end$$;
notify pgrst,'reload schema';
