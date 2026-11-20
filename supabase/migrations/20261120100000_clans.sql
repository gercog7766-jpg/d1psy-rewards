-- Permanent clans, private membership and server-authoritative task receipts.
create table public.rewards_clans(id uuid primary key default gen_random_uuid(),name text not null check(char_length(name) between 3 and 32),avatar text,owner_id uuid not null references public.rewards_users(id),min_level int not null default 0 check(min_level between 0 and 1000),min_bp int not null default 0 check(min_bp between 0 and 50),cxp bigint not null default 0 check(cxp>=0),extra_slot boolean not null default false,treasury bigint not null default 0 check(treasury>=0),created_at timestamptz not null default clock_timestamp());
create unique index rewards_clans_name on public.rewards_clans(lower(name));
alter table public.rewards_clans add column decorations jsonb not null default '{}';
create table public.rewards_clan_members(id uuid primary key default gen_random_uuid(),clan_id uuid not null references public.rewards_clans(id),user_id uuid not null references public.rewards_users(id),joined_at timestamptz not null default clock_timestamp(),left_at timestamptz);
create unique index rewards_clans_one_membership on public.rewards_clan_members(user_id) where left_at is null;
create index rewards_clan_members_history on public.rewards_clan_members(user_id,joined_at,left_at);
create table public.rewards_clan_requests(clan_id uuid not null references public.rewards_clans(id),user_id uuid not null references public.rewards_users(id),created_at timestamptz not null default clock_timestamp(),primary key(clan_id,user_id));
create table public.rewards_clan_chat(id uuid primary key default gen_random_uuid(),clan_id uuid not null references public.rewards_clans(id),user_id uuid not null references public.rewards_users(id),message text not null check(char_length(message) between 1 and 240),created_at timestamptz not null default clock_timestamp());
create table public.rewards_clan_ledger(id uuid primary key default gen_random_uuid(),clan_id uuid not null references public.rewards_clans(id),user_id uuid references public.rewards_users(id),amount int not null check(amount>0),kind text not null check(kind in('deposit','level')),request_id uuid unique,created_at timestamptz not null default clock_timestamp());
create table public.rewards_clan_events(source text not null,event_key text not null,clan_id uuid not null references public.rewards_clans(id),user_id uuid not null references public.rewards_users(id),amount int not null check(amount>0),occurred_at timestamptz not null,primary key(source,event_key));
create index rewards_clan_events_period on public.rewards_clan_events(clan_id,occurred_at,source);
create table public.rewards_clan_task_templates(source text primary key,label text not null,target int not null check(target>0),cxp int not null check(cxp>0));
insert into public.rewards_clan_task_templates values ('vault','Внести ключи THE VAULT',200,160),('record','Итоговые недельные рекорды',2,170),('red','Победы в Красной кнопке',3,180),('deposit','Внести монеты в общак',1000,150),('defuse','Победы в Defuse',25,100),('ms','Победы в сапёре',20,70),('checkers','Победы в шашках над игроками вне клана',20,60),('daily','Ежедневный бонус',30,30),('promo','Активации промокодов',40,60),('guess','Отгадать слово',1,20);
create table public.rewards_clan_tasks(period date not null,source text not null,label text not null,target int not null,cxp int not null,primary key(period,source));
create table public.rewards_clan_task_awards(clan_id uuid not null references public.rewards_clans(id),period date not null,source text not null,cxp int not null,awarded_at timestamptz not null default clock_timestamp(),primary key(clan_id,period,source),foreign key(period,source) references public.rewards_clan_tasks(period,source));
create table public.rewards_clan_levels(clan_id uuid not null references public.rewards_clans(id),level int not null,primary key(clan_id,level));
create table public.rewards_clan_moderation(id uuid primary key default gen_random_uuid(),clan_id uuid not null references public.rewards_clans(id),actor text not null,action text not null,created_at timestamptz not null default clock_timestamp());
create table public.rewards_clan_season_results(season_start date not null,clan_id uuid not null references public.rewards_clans(id),name text not null,rank int not null,score bigint not null,prize int not null,primary key(season_start,clan_id));
alter table public.rewards_clan_season_results enable row level security;
revoke all on public.rewards_clan_season_results from public,anon,authenticated;
grant select,insert,update on public.rewards_clan_season_results to service_role;
do $$ declare t text; begin foreach t in array array['rewards_clans','rewards_clan_members','rewards_clan_requests','rewards_clan_chat','rewards_clan_ledger','rewards_clan_events','rewards_clan_task_templates','rewards_clan_tasks','rewards_clan_task_awards','rewards_clan_levels','rewards_clan_moderation'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on public.%I to service_role',t);end loop;end $$;
create function public.rewards_clan_level(p_xp bigint) returns int language sql immutable set search_path='' as $$select max(l)::int from generate_series(1,67) l where ((l-1)*250+(l-1)*(l-2)*25/2)<=p_xp$$;
create function public.rewards_clan_capacity(p_xp bigint,p_extra boolean) returns int language sql immutable set search_path='' as $$select 5+count(*)::int+case when p_extra then 1 else 0 end from unnest(array[3,5,10,16,22,29,36,44,53,63]) n where n<=public.rewards_clan_level(p_xp)$$;
create function public.rewards_clan_period(p_at timestamptz) returns date language sql immutable set search_path='' as $$select case when (p_at at time zone 'Europe/Moscow')::date<date '2026-11-30' then date '2026-11-20' else date_trunc('week',p_at at time zone 'Europe/Moscow')::date end$$;
create function public.rewards_clan_eligible(p_user uuid,p_min_level int,p_min_bp int) returns boolean language plpgsql stable set search_path='' as $$
declare xp int;sp int;bp int:=0;n int;cost int;begin
 select xp_total into xp from public.rewards_users where id=p_user and not coalesce(banned,false) and not coalesce(participation_restricted,false);if not found then return false;end if;
 if greatest(1,floor((sqrt(9+8*greatest(0,xp)/75.0)-3)/2)::int+1)<p_min_level then return false;end if;
 select coalesce((select s.sp from public.rewards_season_progress s where s.user_id=p_user and s.season_id='s1'),0) into sp;
 for n in 1..50 loop cost:=case when n<=4 then 500 when n<=10 then 750 when n<=15 then 1000 when n<=29 then 1250 when n<=40 then 1500 else 2000 end;exit when sp<cost;sp:=sp-cost;bp:=bp+1;end loop;
 return bp>=p_min_bp;
end $$;
revoke all on function public.rewards_clan_eligible(uuid,int,int) from public,anon,authenticated;
grant execute on function public.rewards_clan_eligible(uuid,int,int) to service_role;
create function public.rewards_clan_record(p_source text,p_key text,p_user uuid,p_amount int,p_at timestamptz,p_opponent uuid default null) returns void language plpgsql set search_path='' as $$
declare c uuid;begin
 if p_user is null or p_at<'2026-11-20 00:00:00+03'::timestamptz or p_amount<=0 then return;end if;
 select clan_id into c from public.rewards_clan_members where user_id=p_user and joined_at<=p_at and (left_at is null or left_at>p_at) order by joined_at desc limit 1;
 if c is null or (p_opponent is not null and exists(select 1 from public.rewards_clan_members where clan_id=c and user_id=p_opponent and joined_at<=p_at and (left_at is null or left_at>p_at))) then return;end if;
 insert into public.rewards_clan_events values(p_source,p_key,c,p_user,p_amount,p_at) on conflict do nothing;
end $$;
create function public.rewards_clan_capture() returns trigger language plpgsql set search_path='' as $$
declare j jsonb:=to_jsonb(new);o jsonb;u uuid;op uuid;at_time timestamptz:=clock_timestamp();k text;source text;amount int:=1;
begin
 if TG_OP='UPDATE' then o:=to_jsonb(old);end if;
 k:=j->>'id';u:=(j->>'user_id')::uuid;
 case TG_TABLE_NAME
 when 'rewards_vault_contributions' then source:='vault';k:=j->>'request_id';amount:=(j->>'amount')::int;at_time:=(j->>'created_at')::timestamptz;
 when 'rewards_game_week_results' then if j->>'rank'<>'1' then return new;end if;source:='record';k:=concat_ws(':',j->>'week_start',j->>'game',j->>'category');at_time:=(j->>'completed_at')::timestamptz;
 when 'rewards_red_button_rounds' then if j->>'winner' is null or o->>'winner' is not null then return new;end if;source:='red';u:=(j->>'winner')::uuid;at_time:=(j->>'ends_at')::timestamptz-interval '1 microsecond';
 when 'rewards_defuse_games' then if j->>'status'<>'won' or o->>'status'='won' then return new;end if;source:='defuse';at_time:=coalesce((j->>'finished_at')::timestamptz,at_time);
 when 'rewards_ms_games' then if j->>'status'<>'won' or o->>'status'='won' then return new;end if;source:='ms';at_time:=coalesce((j->>'finished_at')::timestamptz,at_time);
 when 'rewards_checkers_rooms' then if j->>'status'<>'won' or o->>'status'='won' or j->>'winner_id' is null then return new;end if;source:='checkers';u:=(j->>'winner_id')::uuid;op:=case when u=(j->>'host_id')::uuid then (j->>'guest_id')::uuid else (j->>'host_id')::uuid end;
 when 'rewards_coin_transactions' then if not (coalesce(j->>'note','') ~ '^Ежедневный бонус · день [1-7]$' and (j->>'amount')::int>0) then return new;end if;source:='daily';at_time:=coalesce((j->>'created_at')::timestamptz,at_time);
 when 'rewards_promo_redemptions' then source:='promo';k:='owner:'||k;at_time:=(j->>'created_at')::timestamptz;
 when 'rewards_streamer_live_awards' then if j->>'promo_id' is null then return new;end if;source:='promo';k:='streamer:'||k;at_time:=(j->>'created_at')::timestamptz;
 when 'rewards_advent_promo_redemptions' then source:='promo';k:='advent:'||u::text||':'||(j->>'day');at_time:=(j->>'redeemed_at')::timestamptz;
 when 'rewards_guess_rounds' then if j->>'status'<>'won' or o->>'status'='won' then return new;end if;source:='guess';u:=(j->>'winner_id')::uuid;at_time:=coalesce((j->>'ended_at')::timestamptz,at_time);
 else return new;end case;
 perform public.rewards_clan_record(source,k,u,amount,at_time,op);return new;
end $$;
create trigger rewards_clan_vault after insert on public.rewards_vault_contributions for each row execute function public.rewards_clan_capture();
create trigger rewards_clan_records after insert on public.rewards_game_week_results for each row execute function public.rewards_clan_capture();
create trigger rewards_clan_red after update on public.rewards_red_button_rounds for each row execute function public.rewards_clan_capture();
create trigger rewards_clan_defuse after update on public.rewards_defuse_games for each row execute function public.rewards_clan_capture();
create trigger rewards_clan_ms after update on public.rewards_ms_games for each row execute function public.rewards_clan_capture();
create trigger rewards_clan_checkers after update on public.rewards_checkers_rooms for each row execute function public.rewards_clan_capture();
create trigger rewards_clan_daily after insert on public.rewards_coin_transactions for each row execute function public.rewards_clan_capture();
create trigger rewards_clan_promo after insert on public.rewards_promo_redemptions for each row execute function public.rewards_clan_capture();
create trigger rewards_clan_promo_stream after insert on public.rewards_streamer_live_awards for each row execute function public.rewards_clan_capture();
create trigger rewards_clan_promo_advent after insert on public.rewards_advent_promo_redemptions for each row execute function public.rewards_clan_capture();
create trigger rewards_clan_guess after update on public.rewards_guess_rounds for each row execute function public.rewards_clan_capture();
create function public.rewards_clan_tick() returns void language plpgsql set search_path='' as $$
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
 -- Keep a permanent monthly podium, without paying coins before distribution is approved.
 season:=date '2026-11-20';
 loop
 season_end:=case when season=date '2026-11-20' then date '2027-01-01' else (season+interval '1 month')::date end;
 exit when (clock_timestamp() at time zone 'Europe/Moscow')::date<season_end;
 insert into public.rewards_clan_season_results(season_start,clan_id,name,rank,score,prize)
 select season,id,name,r,score,case r when 1 then 1500 when 2 then 750 when 3 then 250 end from
 (select id,name,score,row_number() over(order by score desc,created_at,id)::int r from
 (select c0.id,c0.name,c0.created_at,sum(a.cxp) score from public.rewards_clans c0 join public.rewards_clan_task_awards a on a.clan_id=c0.id where (a.awarded_at at time zone 'Europe/Moscow')::date>=season and (a.awarded_at at time zone 'Europe/Moscow')::date<season_end group by c0.id)x)y where r<=3 on conflict do nothing;
 season:=season_end;end loop;
end $$;
-- No direct access for browser roles, including helpers called by source triggers.
revoke all on function public.rewards_clan_level(bigint),public.rewards_clan_capacity(bigint,boolean),public.rewards_clan_period(timestamptz),public.rewards_clan_record(text,text,uuid,int,timestamptz,uuid),public.rewards_clan_capture(),public.rewards_clan_tick() from public,anon,authenticated;
grant execute on function public.rewards_clan_level(bigint),public.rewards_clan_capacity(bigint,boolean),public.rewards_clan_period(timestamptz),public.rewards_clan_record(text,text,uuid,int,timestamptz,uuid),public.rewards_clan_capture(),public.rewards_clan_tick() to service_role;
notify pgrst,'reload schema';

create function public.rewards_clan_api(p_actor text,p_action text,p_body jsonb default '{}') returns jsonb language plpgsql set search_path='' as $$
declare me public.rewards_users; c public.rewards_clans; mine uuid; target uuid; req uuid; n int; lvl int; bp int; sp int; cost int; p date:=public.rewards_clan_period(clock_timestamp()); season_start timestamptz; result jsonb; name_text text; avatar_text text;
begin
 if jsonb_typeof(p_body) is distinct from 'object' then raise exception 'invalid_request';end if;
 select * into me from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false);if not found then raise exception 'user_unavailable';end if;
 perform public.rewards_clan_tick();
 select clan_id into mine from public.rewards_clan_members where user_id=me.id and left_at is null;
 if p_action='list' then
 season_start:=case when clock_timestamp()<'2027-01-01 00:00:00+03'::timestamptz then '2026-11-20 00:00:00+03'::timestamptz else date_trunc('month',clock_timestamp() at time zone 'Europe/Moscow') at time zone 'Europe/Moscow' end;
 return jsonb_build_object('mine',mine,'clans',(select coalesce(jsonb_agg(to_jsonb(x)-'created_at' order by x.score desc,x.created_at,x.id),'[]'::jsonb) from (select c0.id,c0.name,c0.avatar,c0.created_at,public.rewards_clan_level(c0.cxp) level,coalesce((select sum(a.cxp) from public.rewards_clan_task_awards a where a.clan_id=c0.id and a.awarded_at>=season_start),0) score from public.rewards_clans c0 order by score desc,c0.created_at,c0.id limit 200)x),'past',(select coalesce(jsonb_agg(to_jsonb(s) order by s.season_start desc,s.rank),'[]') from public.rewards_clan_season_results s));
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
 return jsonb_build_object('id',c.id,'name',c.name,'avatar',c.avatar,'member',true,'leader',c.owner_id=me.id,'level',public.rewards_clan_level(c.cxp),'cxp',c.cxp,'capacity',public.rewards_clan_capacity(c.cxp,c.extra_slot),'extraSlot',c.extra_slot,'treasury',c.treasury,'minLevel',c.min_level,'minBp',c.min_bp,'decorations',c.decorations,'period',p,'ends',case when p=date '2026-11-20' then date '2026-11-30' else p+7 end,
 'members',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'login',u.twitch_login,'owner',u.id=c.owner_id,'self',u.id=me.id)),'[]') from public.rewards_clan_members m join public.rewards_users u on u.id=m.user_id where m.clan_id=c.id and m.left_at is null),
 'requests',case when c.owner_id=me.id then (select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'login',u.twitch_login)),'[]') from public.rewards_clan_requests r join public.rewards_users u on u.id=r.user_id where r.clan_id=c.id) else '[]'::jsonb end,
 'tasks',(select coalesce(jsonb_agg(jsonb_build_object('source',t.source,'label',t.label,'target',t.target,'cxp',t.cxp,'progress',coalesce((select sum(e.amount) from public.rewards_clan_events e where e.clan_id=c.id and e.source=t.source and public.rewards_clan_period(e.occurred_at)=p),0),'done',exists(select 1 from public.rewards_clan_task_awards a where a.clan_id=c.id and a.period=p and a.source=t.source))),'[]') from public.rewards_clan_tasks t where t.period=p),
 'chat',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]') from (select u.twitch_login login,h.message,h.created_at from public.rewards_clan_chat h join public.rewards_users u on u.id=h.user_id where h.clan_id=c.id order by h.created_at desc limit 60)x),
 'ledger',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') from (select l.amount,l.kind,l.created_at,u.twitch_login login from public.rewards_clan_ledger l left join public.rewards_users u on u.id=l.user_id where l.clan_id=c.id order by l.created_at desc limit 30)x));
end $$;
revoke all on function public.rewards_clan_api(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_clan_api(text,text,jsonb) to service_role;
notify pgrst,'reload schema';
