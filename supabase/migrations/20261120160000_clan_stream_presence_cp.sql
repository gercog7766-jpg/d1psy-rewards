-- Verified Twitch chat presence, not video playback. No viewer IDs are retained unless they belong to a clan.
create table public.rewards_clan_chat_channels(broadcaster text primary key,authorized_at timestamptz not null,last_checked_at timestamptz,last_success_at timestamptz,last_error text);
create table public.rewards_clan_chat_samples(bucket bigint primary key,observed_at timestamptz not null);
create table public.rewards_clan_chat_presence(user_id uuid primary key references public.rewards_users(id),membership_id uuid not null references public.rewards_clan_members(id),last_bucket bigint not null,last_seen timestamptz not null);
create table public.rewards_clan_chat_minutes(season_start date not null,clan_id uuid not null references public.rewards_clans(id),user_id uuid not null references public.rewards_users(id),seconds bigint not null default 0 check(seconds>=0),primary key(season_start,clan_id,user_id));
create table public.rewards_clan_chat_cp_awards(season_start date not null,clan_id uuid not null references public.rewards_clans(id),user_id uuid not null references public.rewards_users(id),hour_no bigint not null check(hour_no>0),awarded_at timestamptz not null,primary key(season_start,clan_id,user_id,hour_no));
alter table public.rewards_clan_season_results add column stream_cp bigint not null default 0;
do $$ declare t text;begin foreach t in array array['rewards_clan_chat_channels','rewards_clan_chat_samples','rewards_clan_chat_presence','rewards_clan_chat_minutes','rewards_clan_chat_cp_awards'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on public.%I to service_role',t);end loop;end $$;
create index rewards_clan_chat_awards_period on public.rewards_clan_chat_cp_awards(season_start,awarded_at,clan_id);
create function public.rewards_clan_chat_now() returns timestamptz language sql volatile set search_path='' as $$select clock_timestamp()$$;
create function public.rewards_clan_chat_sample(p_at timestamptz,p_viewers text[]) returns integer language plpgsql set search_path='' as $$
declare bucket bigint;season date;boundary timestamptz;awards integer;begin
 if p_at is null or p_viewers is null or cardinality(p_viewers)>50000 or abs(extract(epoch from(public.rewards_clan_chat_now()-p_at)))>90 or exists(select 1 from unnest(p_viewers) x where x is null or x !~ '^[0-9]{1,30}$') then raise exception 'invalid_request';end if;
 perform pg_advisory_xact_lock(827392105::bigint);
 bucket:=floor(extract(epoch from p_at)/300)::bigint;season:=public.rewards_clan_season_start(p_at);boundary:=season::timestamp at time zone 'Europe/Moscow';
 insert into public.rewards_clan_chat_samples values(bucket,p_at) on conflict do nothing;if not found then return 0;end if;
 -- Only two consecutive successful observations of the same membership earn elapsed seconds.
 -- The bucket is global, so simultaneous chat rooms cannot multiply the credit.
 with eligible as (select m.id membership_id,m.clan_id,m.user_id,m.joined_at from public.rewards_clan_members m join public.rewards_users u on u.id=m.user_id where m.left_at is null and m.joined_at<=p_at and u.twitch_user_id=any(p_viewers) and not coalesce(u.banned,false) and not coalesce(u.participation_restricted,false)),
 credit as (select e.clan_id,e.user_id,least(300,greatest(0,floor(extract(epoch from(p_at-greatest(h.last_seen,boundary,e.joined_at))))))::bigint seconds from eligible e join public.rewards_clan_chat_presence h on h.user_id=e.user_id and h.membership_id=e.membership_id where h.last_bucket=bucket-1 and p_at-h.last_seen between interval '4 minutes' and interval '6 minutes'),
 totals as (insert into public.rewards_clan_chat_minutes(season_start,clan_id,user_id,seconds) select season,c.clan_id,c.user_id,c.seconds from credit c where c.seconds>0 on conflict(season_start,clan_id,user_id) do update set seconds=public.rewards_clan_chat_minutes.seconds+excluded.seconds returning clan_id,user_id,seconds),
 inserted as (insert into public.rewards_clan_chat_cp_awards(season_start,clan_id,user_id,hour_no,awarded_at) select season,t.clan_id,t.user_id,g.hour_no,p_at from totals t cross join lateral generate_series(greatest(1,(t.seconds-300)/3600+1),t.seconds/3600) g(hour_no) on conflict do nothing returning 1)
 select count(*)::integer into awards from inserted;
 insert into public.rewards_clan_chat_presence(user_id,membership_id,last_bucket,last_seen) select m.user_id,m.id,bucket,p_at from public.rewards_clan_members m join public.rewards_users u on u.id=m.user_id where m.left_at is null and m.joined_at<=p_at and u.twitch_user_id=any(p_viewers) and not coalesce(u.banned,false) and not coalesce(u.participation_restricted,false) on conflict(user_id) do update set membership_id=excluded.membership_id,last_bucket=excluded.last_bucket,last_seen=excluded.last_seen where public.rewards_clan_chat_presence.last_bucket<excluded.last_bucket;
 delete from public.rewards_clan_chat_presence where last_seen<p_at-interval '24 hours';
 return awards;
end $$;
revoke all on function public.rewards_clan_chat_now(),public.rewards_clan_chat_sample(timestamptz,text[]) from public,anon,authenticated;
grant execute on function public.rewards_clan_chat_now(),public.rewards_clan_chat_sample(timestamptz,text[]) to service_role;
create or replace function public.rewards_clan_cp_scores(p_start date,p_until timestamptz,p_clan uuid default null)
returns table(clan_id uuid,base_cp bigint,bonus_cp bigint,cp bigint,last_at timestamptz)
language sql stable set search_path='' as $$
with bounds as (select p_start::timestamp at time zone 'Europe/Moscow' lo,least(p_until,public.rewards_clan_season_end(p_start)::timestamp at time zone 'Europe/Moscow') hi),
base_receipts as (select a.clan_id,a.cxp,coalesce((select min(x.received_at) from (select e.received_at,sum(e.amount) over(order by e.received_at,e.event_key rows unbounded preceding) total from public.rewards_clan_events e where e.clan_id=a.clan_id and e.source=a.source and e.occurred_at>=a.period::timestamp at time zone 'Europe/Moscow' and e.occurred_at<(case when a.period=date '2026-11-20' then date '2026-11-30' else a.period+7 end)::timestamp at time zone 'Europe/Moscow' and e.received_at<=a.awarded_at)x where x.total>=t.target),a.awarded_at) completed_at
 from public.rewards_clan_task_awards a join public.rewards_clan_tasks t on t.period=a.period and t.source=a.source cross join bounds b where a.awarded_at>=b.lo and a.period<(b.hi at time zone 'Europe/Moscow')::date+1 and (p_clan is null or a.clan_id=p_clan)),
base as (select a.clan_id,sum(a.cxp)::bigint points,max(a.completed_at) latest from base_receipts a cross join bounds b where a.completed_at>=b.lo and a.completed_at<b.hi group by a.clan_id),
relevant as (select distinct e.clan_id,e.source,public.rewards_clan_period(e.occurred_at) period from public.rewards_clan_events e cross join bounds b where e.received_at>=b.lo and e.received_at<b.hi and public.rewards_clan_cp_rate(e.source)>0 and (p_clan is null or e.clan_id=p_clan)),
periods as (select distinct r.clan_id,r.period,r.period::timestamp at time zone 'Europe/Moscow' lo,(case when r.period=date '2026-11-20' then date '2026-11-30' else r.period+7 end)::timestamp at time zone 'Europe/Moscow' hi from relevant r),
roster as (select p.clan_id,p.period,greatest(5,count(distinct m.user_id))::numeric size from periods p cross join bounds b left join public.rewards_clan_members m on m.clan_id=p.clan_id and m.joined_at<least(p.hi,b.hi) and (m.left_at is null or m.left_at>p.lo) group by p.clan_id,p.period),
running as (select e.clan_id,r.period,e.source,e.event_key,e.amount,e.received_at,t.target,public.rewards_clan_cp_rate(e.source) rate,sum(e.amount) over(partition by e.clan_id,r.period,e.source order by e.received_at,e.event_key rows unbounded preceding) total
 from relevant r join periods p on p.clan_id=r.clan_id and p.period=r.period join public.rewards_clan_tasks t on t.period=r.period and t.source=r.source join public.rewards_clan_events e on e.clan_id=r.clan_id and e.source=r.source and e.occurred_at>=p.lo and e.occurred_at<p.hi cross join bounds b where e.received_at<b.hi),
extras as (select r.clan_id,r.period,r.source,r.event_key,r.received_at,(greatest(0,r.total-r.target)-greatest(0,r.total-r.amount-r.target))*r.rate raw from running r cross join bounds b where r.received_at>=b.lo and r.total>r.target),
weighted as (select e.*,f.size,sum(e.raw) over(partition by e.clan_id,e.period order by e.received_at,e.source,e.event_key rows unbounded preceding) total from extras e join roster f on f.clan_id=e.clan_id and f.period=e.period),
weekly as (select w.clan_id,w.period,max(floor(w.total*5/w.size))::bigint points,max(w.received_at) filter(where floor(w.total*5/w.size)>floor((w.total-w.raw)*5/w.size)) latest from weighted w group by w.clan_id,w.period),
bonus as (select w.clan_id,sum(w.points)::bigint points,max(w.latest) latest from weekly w group by w.clan_id),
stream as (select a.clan_id,count(*)::bigint points,max(a.awarded_at) latest from public.rewards_clan_chat_cp_awards a cross join bounds b where a.season_start=p_start and a.awarded_at>=b.lo and a.awarded_at<b.hi and (p_clan is null or a.clan_id=p_clan) group by a.clan_id)
select c.id,coalesce(b.points,0),coalesce(x.points,0),coalesce(b.points,0)+coalesce(x.points,0)+coalesce(s.points,0),greatest(b.latest,x.latest,s.latest)
from public.rewards_clans c left join base b on b.clan_id=c.id left join bonus x on x.clan_id=c.id left join stream s on s.clan_id=c.id where (p_clan is null or c.id=p_clan) and c.created_at<p_until;
$$;

create or replace function public.rewards_clan_tick() returns void language plpgsql set search_path='' as $$
declare t record; c record;l int;coins int; current_period date:=public.rewards_clan_period(clock_timestamp()); season date; season_end date;begin
 perform pg_advisory_xact_lock(827392105::bigint);
 insert into public.rewards_clan_tasks select current_period,source,label,target,cxp from public.rewards_clan_task_templates on conflict do nothing;
 for t in select e.clan_id,ts.period,ts.source,ts.cxp from public.rewards_clan_events e join public.rewards_clan_tasks ts on ts.period=public.rewards_clan_period(e.occurred_at) and ts.source=e.source where not exists(select 1 from public.rewards_clan_task_awards a where a.clan_id=e.clan_id and a.period=ts.period and a.source=ts.source) group by e.clan_id,ts.period,ts.source,ts.cxp,ts.target having sum(e.amount)>=ts.target loop
 insert into public.rewards_clan_task_awards(clan_id,period,source,cxp) values(t.clan_id,t.period,t.source,t.cxp) on conflict do nothing;
 if found then update public.rewards_clans set cxp=cxp+t.cxp where id=t.clan_id;end if;
 end loop;
 for c in select id,cxp from public.rewards_clans loop
 for l in 2..public.rewards_clan_level(c.cxp) loop
 insert into public.rewards_clan_levels values(c.id,l) on conflict do nothing;
 if found then coins:=case l when 4 then 50 when 8 then 50 when 13 then 75 when 19 then 100 when 25 then 125 when 32 then 150 when 41 then 200 when 48 then 250 when 54 then 300 when 61 then 350 else 0 end;
 if coins>0 then update public.rewards_clans set treasury=treasury+coins where id=c.id;insert into public.rewards_clan_ledger(clan_id,amount,kind) values(c.id,coins,'level');end if;end if;
 end loop;end loop;
 -- Freeze the finalized seasonal CP podium; prize distribution remains deferred.
 season:=date '2026-11-20';
 loop
 season_end:=public.rewards_clan_season_end(season);
 exit when clock_timestamp()<(season_end::timestamp at time zone 'Europe/Moscow')+interval '2 minutes';
 insert into public.rewards_clan_cp_seasons(season_start,season_end) values(season,season_end) on conflict do nothing;
 if found then
  insert into public.rewards_clan_season_results(season_start,clan_id,name,rank,score,prize,base_cp,bonus_cp,stream_cp)
  select season,r.id,r.name,r.rank::int,r.score,case r.rank when 1 then 1500 when 2 then 750 when 3 then 250 end,r.base_cp,r.bonus_cp,r.score-r.base_cp-r.bonus_cp
  from public.rewards_clan_cp_rank(season,season_end::timestamp at time zone 'Europe/Moscow') r where r.rank<=3 and r.score>0 on conflict do nothing;
 end if;
 season:=season_end;end loop;
end $$;

create or replace function public.rewards_clan_api(p_actor text,p_action text,p_body jsonb default '{}') returns jsonb language plpgsql set search_path='' as $$
declare me public.rewards_users; c public.rewards_clans; mine uuid; target uuid; req uuid; n int; lvl int; bp int; sp int; cost int; p date:=public.rewards_clan_period(clock_timestamp()); season_start date;season_end date;cp_now timestamptz; result jsonb; name_text text; avatar_text text;
begin
 if jsonb_typeof(p_body) is distinct from 'object' then raise exception 'invalid_request';end if;
 select * into me from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false);if not found then raise exception 'user_unavailable';end if;
 perform public.rewards_clan_tick();
 cp_now:=clock_timestamp();season_start:=public.rewards_clan_season_start(cp_now);season_end:=public.rewards_clan_season_end(season_start);
 select clan_id into mine from public.rewards_clan_members where user_id=me.id and left_at is null;
 if p_action='list' then
 with ranking as materialized (select * from public.rewards_clan_cp_rank(season_start,cp_now))
 select jsonb_build_object('mine',mine,'seasonStart',season_start,'seasonEnd',season_end,'serverNow',cp_now,
 'myRank',(select r.rank from ranking r where r.id=mine),
 'myScore',(select r.score from ranking r where r.id=mine),
 'clans',(select coalesce(jsonb_agg(to_jsonb(x) order by x.rank),'[]'::jsonb) from (select * from ranking order by rank limit 200)x),
 'past',(select coalesce(jsonb_agg(to_jsonb(s) order by s.season_start desc,s.rank),'[]') from public.rewards_clan_season_results s)) into result;
 return result;
 end if;
 if p_action='admin' or p_action='moderate' or p_action='templates' then
 if not exists(select 1 from public.rewards_admins where twitch_user_id=p_actor) then raise exception 'admin_required';end if;
 if p_action='moderate' then target:=(p_body->>'clanId')::uuid;name_text:=nullif(trim(p_body->>'name'),'');if name_text is not null and char_length(name_text) not between 3 and 32 then raise exception 'invalid_request';end if;update public.rewards_clans set name=coalesce(name_text,name),avatar=case when coalesce((p_body->>'removeAvatar')::boolean,false) then null else avatar end where id=target;if not found then raise exception 'not_found';end if;insert into public.rewards_clan_moderation(clan_id,actor,action) values(target,p_actor,'moderate');end if;
 if p_action='templates' then update public.rewards_clan_task_templates set target=(p_body->>'target')::int,cxp=(p_body->>'cxp')::int,label=left(p_body->>'label',120) where source=p_body->>'source';if not found then raise exception 'invalid_request';end if;end if;
 return jsonb_build_object('clans',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'avatar',avatar,'cxp',cxp,'treasury',treasury) order by name),'[]') from public.rewards_clans),'templates',(select jsonb_agg(to_jsonb(t)) from public.rewards_clan_task_templates t));
 end if;
 if p_action='create' then
 if mine is not null then raise exception 'already_member';end if;
 perform 1 from public.rewards_users where id=me.id and not coalesce(participation_restricted,false) for update;if not found then raise exception 'user_unavailable';end if;
 name_text:=trim(p_body->>'name');if name_text is null or char_length(name_text) not between 3 and 32 or name_text ~ '[[:cntrl:]]' then raise exception 'invalid_request';end if;
 if (select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=me.id)<150 then raise exception 'insufficient_coins';end if;
 insert into public.rewards_clans(name,owner_id,avatar) values(name_text,me.id,nullif(p_body->>'avatar','')) returning id into mine;
 insert into public.rewards_clan_members(clan_id,user_id) values(mine,me.id);insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(me.id,-150,'adjustment','Создание клана · '||mine);return jsonb_build_object('id',mine);
 end if;
 target:=coalesce((p_body->>'clanId')::uuid,mine);select * into c from public.rewards_clans where id=target;if not found then raise exception 'not_found';end if;
 if p_action='apply' then
 if mine is not null then raise exception 'already_member';end if;
 if not public.rewards_clan_eligible(me.id,c.min_level,c.min_bp) then raise exception 'requirements';end if;
 if (select count(*) from public.rewards_clan_members where clan_id=c.id and left_at is null)>=public.rewards_clan_capacity(c.cxp,c.extra_slot) then raise exception 'clan_full';end if;
 insert into public.rewards_clan_requests(clan_id,user_id) values(c.id,me.id) on conflict do nothing;return jsonb_build_object('ok',true);
 end if;
 if p_action='detail' and mine is distinct from c.id then return jsonb_build_object('id',c.id,'name',c.name,'avatar',c.avatar,'level',public.rewards_clan_level(c.cxp),'member',false,'pending',exists(select 1 from public.rewards_clan_requests where clan_id=c.id and user_id=me.id));end if;
 if mine is distinct from c.id then raise exception 'member_required';end if;
 if p_action in('settings','approve','reject','kick','slot','cosmetic') and c.owner_id<>me.id then raise exception 'leader_required';end if;
 if p_action='settings' then name_text:=trim(p_body->>'name');if char_length(name_text) not between 3 and 32 or name_text ~ '[[:cntrl:]]' then raise exception 'invalid_request';end if;update public.rewards_clans set name=name_text,avatar=case when p_body?'avatar' then nullif(p_body->>'avatar','') else avatar end,min_level=(p_body->>'minLevel')::int,min_bp=(p_body->>'minBp')::int where id=c.id;
 elsif p_action='cosmetic' then
 n:=(p_body->>'reward')::int;name_text:=case when n=any(array[2,12,21,30,40,49,56,65]) then 'frame' when n=any(array[6,11,23,35,45,52,62]) then 'background' when n=any(array[7,15,33,37,51]) then 'tag' when n=any(array[9,31,43]) then 'badge' when n=any(array[14,27,38,59]) then 'flag' when n=any(array[18,28,39,47,57,64]) then 'banner' when n=any(array[20,50,60]) then 'medal' when n=any(array[26,34,46,58,67]) then 'title' when n=any(array[17,24,42,55,66]) then 'effect' end;
 if name_text is null or n>public.rewards_clan_level(c.cxp) then raise exception 'requirements';end if;
 update public.rewards_clans set decorations=decorations||jsonb_build_object(name_text,n) where id=c.id;
 elsif p_action in('approve','reject','kick') then
 target:=(p_body->>'userId')::uuid;if target=c.owner_id then raise exception 'invalid_request';end if;
 if p_action='kick' then update public.rewards_clan_members set left_at=clock_timestamp() where clan_id=c.id and user_id=target and left_at is null;
 else if not exists(select 1 from public.rewards_clan_requests where clan_id=c.id and user_id=target) then raise exception 'not_found';end if;
 if p_action='approve' then if not public.rewards_clan_eligible(target,c.min_level,c.min_bp) then raise exception 'requirements';end if;perform 1 from public.rewards_clans where id=c.id for update;if (select count(*) from public.rewards_clan_members where clan_id=c.id and left_at is null)>=public.rewards_clan_capacity(c.cxp,c.extra_slot) then raise exception 'clan_full';end if;insert into public.rewards_clan_members(clan_id,user_id) values(c.id,target);delete from public.rewards_clan_requests where user_id=target;else delete from public.rewards_clan_requests where clan_id=c.id and user_id=target;end if;end if;
 elsif p_action='leave' then if c.owner_id=me.id then raise exception 'leader_required';end if;update public.rewards_clan_members set left_at=clock_timestamp() where clan_id=c.id and user_id=me.id and left_at is null;return jsonb_build_object('ok',true);
 elsif p_action='slot' or p_action='deposit' then
 perform 1 from public.rewards_users where id=me.id and not coalesce(participation_restricted,false) for update;if not found then raise exception 'user_unavailable';end if;
 perform 1 from public.rewards_clans where id=c.id for update;
 if p_action='slot' then if exists(select 1 from public.rewards_clans where id=c.id and extra_slot) then return jsonb_build_object('ok',true);end if;n:=50;else n:=(p_body->>'amount')::int;req:=(p_body->>'requestId')::uuid;if n is null or n not between 1 and 100000 or req is null then raise exception 'invalid_request';end if;if exists(select 1 from public.rewards_clan_ledger where request_id=req and user_id=me.id and clan_id=c.id) then return jsonb_build_object('ok',true);end if;end if;
 if (select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=me.id)<n then raise exception 'insufficient_coins';end if;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(me.id,-n,'adjustment',case when p_action='slot' then 'Дополнительный слот клана' else 'Пополнение общака клана' end);
 if p_action='slot' then update public.rewards_clans set extra_slot=true where id=c.id;else update public.rewards_clans set treasury=treasury+n where id=c.id;insert into public.rewards_clan_ledger(clan_id,user_id,amount,kind,request_id) values(c.id,me.id,n,'deposit',req);perform public.rewards_clan_record('deposit',req::text,me.id,n,clock_timestamp());end if;
 elsif p_action='chat' then if char_length(trim(p_body->>'message')) not between 1 and 240 then raise exception 'invalid_request';end if;insert into public.rewards_clan_chat(clan_id,user_id,message) values(c.id,me.id,trim(p_body->>'message'));
 elsif p_action<>'detail' then raise exception 'invalid_request';end if;
 perform public.rewards_clan_tick();
 select * into c from public.rewards_clans where id=c.id;
 return jsonb_build_object('id',c.id,'name',c.name,'avatar',c.avatar,'member',true,'leader',c.owner_id=me.id,'level',public.rewards_clan_level(c.cxp),'cxp',c.cxp,'cp',(select s.cp from public.rewards_clan_cp_scores(season_start,clock_timestamp(),c.id) s),'streamCp',(select count(*) from public.rewards_clan_chat_cp_awards a where a.clan_id=c.id and a.season_start=public.rewards_clan_season_start(clock_timestamp())),'capacity',public.rewards_clan_capacity(c.cxp,c.extra_slot),'extraSlot',c.extra_slot,'treasury',c.treasury,'minLevel',c.min_level,'minBp',c.min_bp,'decorations',c.decorations,'period',p,'ends',case when p=date '2026-11-20' then date '2026-11-30' else p+7 end,
 'members',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'login',u.twitch_login,'owner',u.id=c.owner_id,'self',u.id=me.id)),'[]') from public.rewards_clan_members m join public.rewards_users u on u.id=m.user_id where m.clan_id=c.id and m.left_at is null),
 'requests',case when c.owner_id=me.id then (select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'login',u.twitch_login)),'[]') from public.rewards_clan_requests r join public.rewards_users u on u.id=r.user_id where r.clan_id=c.id) else '[]'::jsonb end,
 'tasks',(select coalesce(jsonb_agg(jsonb_build_object('source',t.source,'label',t.label,'target',t.target,'cxp',t.cxp,'cpRate',public.rewards_clan_cp_rate(t.source),'progress',coalesce((select sum(e.amount) from public.rewards_clan_events e where e.clan_id=c.id and e.source=t.source and public.rewards_clan_period(e.occurred_at)=p),0),'done',exists(select 1 from public.rewards_clan_task_awards a where a.clan_id=c.id and a.period=p and a.source=t.source))),'[]') from public.rewards_clan_tasks t where t.period=p),
 'chat',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]') from (select u.twitch_login login,h.message,h.created_at from public.rewards_clan_chat h join public.rewards_users u on u.id=h.user_id where h.clan_id=c.id order by h.created_at desc limit 60)x),
 'ledger',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') from (select l.amount,l.kind,l.created_at,u.twitch_login login from public.rewards_clan_ledger l left join public.rewards_users u on u.id=l.user_id where l.clan_id=c.id order by l.created_at desc limit 30)x));
end $$;
notify pgrst,'reload schema';
