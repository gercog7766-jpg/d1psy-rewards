-- Personal accumulated progress survives sessions and restarts. Only server-verified samples are accepted.
create table public.rewards_live_economy_totals(user_id uuid primary key references public.rewards_users(id),seconds bigint not null default 0,messages bigint not null default 0,streak int not null default 0,best_streak int not null default 0,last_day date);
create table public.rewards_live_economy_days(day date primary key,seconds int not null default 0);
create table public.rewards_live_economy_channels(broadcaster text primary key,observed_at timestamptz not null,live boolean not null);
create table public.rewards_live_economy_presence(user_id uuid references public.rewards_users(id),broadcaster text,observed_at timestamptz not null,primary key(user_id,broadcaster));
create table public.rewards_live_economy_daily(user_id uuid references public.rewards_users(id),day date,broadcaster text,seconds bigint not null default 0,messages bigint not null default 0,time_coins bigint not null default 0,chat_coins bigint not null default 0,streak_coins bigint not null default 0,primary key(user_id,day,broadcaster));
create table public.rewards_live_economy_messages(id text primary key,at timestamptz not null);
create table public.rewards_live_economy_clock(id int primary key check(id=1),observed_at timestamptz,live boolean not null default false);
insert into public.rewards_live_economy_clock(id) values(1);
create table public.rewards_live_economy_milestones(user_id uuid references public.rewards_users(id),day date,streak int,coins int not null,title text,primary key(user_id,day));
do $$declare t text;begin foreach t in array array['totals','days','channels','presence','daily','messages','clock','milestones'] loop
 execute format('alter table public.rewards_live_economy_%I enable row level security',t);
 execute format('revoke all on public.rewards_live_economy_%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.rewards_live_economy_%I to service_role',t);
end loop;end$$;
create function public.rewards_live_economy_approved(p_channel text) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.rewards_streamers where twitch_broadcaster_id=p_channel and is_primary and enabled) or exists(select 1 from public.rewards_streamer_live_profiles where broadcaster_id=p_channel and status='approved')
$$;
create function public.rewards_live_economy_streak_reward(n int) returns int language sql immutable set search_path='' as $$
 select case when n=3 then 5 when n=5 then 7 when n=10 then 10 when n=50 then 50 when n=100 then 75 when n=150 then 100 when n=200 then 150 when n between 15 and 45 and n%5=0 then 15 when n between 55 and 95 and n%5=0 then 10 when n between 105 and 145 and n%5=0 then 5 when n>=155 and n%5=0 then 10 else 0 end
$$;
-- One row lock per player serializes messages, elapsed time, balances and milestones.
create function public.rewards_live_economy_credit(p_user uuid,p_day date,p_channel text,p_seconds int,p_messages int) returns void language plpgsql set search_path='' as $$
declare t public.rewards_live_economy_totals; time_reward int;chat_reward int;streak_reward int:=0;day_seconds bigint;next_streak int;badge text;
begin
 if p_seconds not between 0 and 300 or p_messages not between 0 and 1 then raise exception 'invalid_credit';end if;
 perform 1 from public.rewards_users where id=p_user and not coalesce(banned,false) and not coalesce(participation_restricted,false) for update;
 if not found then return;end if;
 insert into public.rewards_live_economy_totals(user_id) values(p_user) on conflict do nothing;
 select * into t from public.rewards_live_economy_totals where user_id=p_user for update;
 time_reward:=((t.seconds+p_seconds)/3600-t.seconds/3600)*5;chat_reward:=((t.messages+p_messages)/100-t.messages/100)*2;
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
create function public.rewards_live_economy_sample(p_at timestamptz,p_channels jsonb) returns void language plpgsql set search_path='' as $$
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
 order by u.id,x->>'broadcaster' loop
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
create function public.rewards_live_economy_message(p_channel text,p_actor text,p_id text,p_at timestamptz) returns void language plpgsql set search_path='' as $$
declare u uuid; d date;
begin
 if p_id is null or length(p_id)>200 or p_at is null or abs(extract(epoch from p_at-clock_timestamp()))>600 or p_actor=p_channel or not public.rewards_live_economy_approved(p_channel) then return;end if;
 if not exists(select 1 from public.rewards_live_economy_channels where broadcaster=p_channel and live and observed_at>clock_timestamp()-interval '6 minutes') then return;end if;
 select id into u from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false) and not coalesce(participation_restricted,false);if not found then return;end if;
 insert into public.rewards_live_economy_messages values(p_channel||':'||p_id,p_at) on conflict do nothing;if not found then return;end if;
 d:=(p_at at time zone 'Europe/Moscow')::date;perform public.rewards_live_economy_credit(u,d,p_channel,0,1);
end$$;
-- A lightweight status poll makes stream banners and chat rewards independent of the heavier five-minute viewer scan.
create function public.rewards_live_economy_live_status(p_at timestamptz,p_live text[]) returns void language plpgsql set search_path='' as $$
declare ch text;
begin
 if p_at is null or abs(extract(epoch from p_at-clock_timestamp()))>90 or p_live is null or cardinality(p_live)>200 then raise exception 'invalid_sample';end if;
 perform pg_advisory_xact_lock(78104922);
 update public.rewards_live_economy_channels set live=false,observed_at=p_at where observed_at<p_at and not(broadcaster=any(p_live));
 for ch in select distinct unnest(p_live) loop
  if public.rewards_live_economy_approved(ch) then insert into public.rewards_live_economy_channels values(ch,p_at,true) on conflict(broadcaster) do update set live=true,observed_at=excluded.observed_at where rewards_live_economy_channels.observed_at<excluded.observed_at;end if;
 end loop;
end$$;
revoke all on function public.rewards_live_economy_live_status(timestamptz,text[]) from public,anon,authenticated;
grant execute on function public.rewards_live_economy_live_status(timestamptz,text[]) to service_role;
create function public.rewards_live_economy_stats(p_actor text,p_period text,p_admin boolean default false) returns jsonb language plpgsql stable set search_path='' as $$
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
 return jsonb_build_object('totals',totals,'channels',rows,'timeProgress',coalesce(t.seconds%3600,0),'messageProgress',coalesce(t.messages%100,0),'streak',streak,'bestStreak',coalesce(t.best_streak,0),'todaySeconds',(select coalesce(sum(seconds),0) from public.rewards_live_economy_daily where user_id=u and day=d),'milestones',(select coalesce(jsonb_agg(to_jsonb(m)-'user_id' order by day desc),'[]') from public.rewards_live_economy_milestones m where user_id=u));
end$$;
revoke all on function public.rewards_live_economy_approved(text),public.rewards_live_economy_streak_reward(int),public.rewards_live_economy_credit(uuid,date,text,int,int),public.rewards_live_economy_sample(timestamptz,jsonb),public.rewards_live_economy_message(text,text,text,timestamptz),public.rewards_live_economy_stats(text,text,boolean) from public,anon,authenticated;
grant execute on function public.rewards_live_economy_approved(text),public.rewards_live_economy_streak_reward(int),public.rewards_live_economy_credit(uuid,date,text,int,int),public.rewards_live_economy_sample(timestamptz,jsonb),public.rewards_live_economy_message(text,text,text,timestamptz),public.rewards_live_economy_stats(text,text,boolean) to service_role;
create or replace function public.rewards_live_boost_status(p_actor text) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('live',exists(select 1 from public.rewards_live_economy_channels c where c.live and c.observed_at>now()-interval '6 minutes' and public.rewards_live_economy_approved(c.broadcaster)) and s.enabled,
 'eligible',s.enabled and exists(select 1 from public.rewards_live_economy_presence p join public.rewards_users u on u.id=p.user_id join public.rewards_live_economy_channels c on c.broadcaster=p.broadcaster and c.live and c.observed_at>now()-interval '6 minutes' where u.twitch_user_id=p_actor and not coalesce(u.banned,false) and not coalesce(u.participation_restricted,false) and p.observed_at>now()-interval '6 minutes' and public.rewards_live_economy_approved(p.broadcaster)),
 'login',(select coalesce((select twitch_login from public.rewards_streamers where twitch_broadcaster_id=c.broadcaster limit 1),(select login from public.rewards_streamer_live_profiles where broadcaster_id=c.broadcaster)) from public.rewards_live_economy_channels c where c.live and c.observed_at>now()-interval '6 minutes' and public.rewards_live_economy_approved(c.broadcaster) order by c.broadcaster limit 1))
 from public.rewards_live_boost_state s where s.id=1
$$;
create or replace function public.rewards_live_boost_award() returns trigger language plpgsql set search_path='' as $$
declare old_remainder int; bonus int; total int; stamp timestamptz:=clock_timestamp();
begin
 -- Exclude all administrative corrections, fixed seasonal grants, and
 -- Twitch/chat attendance rewards; only ordinary site XP earns the boost.
 if new.amount<=0 or new.source_type is null or new.source_type in('live_boost','season_reward','giveaway_win')
   or lower(new.source_type)~'(^admin|manual|adjustment|chat|watch|stream|attendance)' then return new;end if;
 if not exists(select 1 from public.rewards_live_economy_presence p join public.rewards_live_economy_channels c on c.broadcaster=p.broadcaster and c.live and c.observed_at>stamp-interval '6 minutes' join public.rewards_live_boost_state s on s.id=1 and s.enabled where p.user_id=new.user_id and p.observed_at>stamp-interval '6 minutes' and public.rewards_live_economy_approved(p.broadcaster)) then return new;end if;
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

create function public.rewards_live_economy_events() returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.login),'[]'::jsonb) from (
 select coalesce((select twitch_login from public.rewards_streamers where twitch_broadcaster_id=c.broadcaster limit 1),(select login from public.rewards_streamer_live_profiles where broadcaster_id=c.broadcaster)) login,
 exists(select 1 from public.rewards_streamer_live_rounds r where r.broadcaster_id=c.broadcaster and r.status='active') or exists(select 1 from public.rewards_rounds r where r.status='active' and (r.streamer_id in(select id from public.rewards_streamers where twitch_broadcaster_id=c.broadcaster) or r.streamer_id is null and exists(select 1 from public.rewards_streamers where twitch_broadcaster_id=c.broadcaster and is_primary and enabled))) giveaway,
 exists(select 1 from public.rewards_connect_sessions r join public.rewards_connect_settings z on z.broadcaster=r.broadcaster and z.enabled where r.broadcaster=c.broadcaster and r.ended_at is null and r.last_seen>now()-interval '2 minutes') drop,
 exists(select 1 from public.rewards_streamers where twitch_broadcaster_id=c.broadcaster and is_primary and enabled) and exists(select 1 from public.rewards_boss_runs where status='active' and not hidden) boss
 from public.rewards_live_economy_channels c where c.live and c.observed_at>now()-interval '6 minutes' and public.rewards_live_economy_approved(c.broadcaster)
 ) x where x.giveaway or x.drop or x.boss
$$;
revoke all on function public.rewards_live_economy_events() from public,anon,authenticated;
grant execute on function public.rewards_live_economy_events() to service_role;
notify pgrst,'reload schema';
