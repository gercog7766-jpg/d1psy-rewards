-- A site-owner inspection visit is not a player membership.
create table public.rewards_clan_owner_visits(
 user_id uuid primary key references public.rewards_users(id),
 clan_id uuid not null references public.rewards_clans(id),
 entered_at timestamptz not null default clock_timestamp()
);
alter table public.rewards_clan_owner_visits enable row level security;
revoke all on public.rewards_clan_owner_visits from public,anon,authenticated;
grant select,insert,update,delete on public.rewards_clan_owner_visits to service_role;

create function public.rewards_clan_is_site_owner(p_actor text) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from public.rewards_admins a where a.twitch_user_id=p_actor)
   and exists(select 1 from public.rewards_streamers s where s.twitch_broadcaster_id=p_actor and s.is_primary and s.enabled)
$$;
revoke all on function public.rewards_clan_is_site_owner(text) from public,anon,authenticated;
grant execute on function public.rewards_clan_is_site_owner(text) to service_role;
create or replace function public.rewards_clan_shop_state(p_clan uuid,p_user uuid) returns jsonb language plpgsql set search_path='' as $$
declare c public.rewards_clans; m uuid;
begin
 select * into c from public.rewards_clans where id=p_clan;
 select id into m from public.rewards_clan_members where clan_id=p_clan and user_id=p_user and left_at is null;
 if m is null and not exists(select 1 from public.rewards_clan_owner_visits v join public.rewards_users u on u.id=v.user_id where v.user_id=p_user and v.clan_id=p_clan and not coalesce(u.banned,false) and public.rewards_clan_is_site_owner(u.twitch_user_id)) then raise exception 'member_required';end if;
 update public.rewards_clan_spend_proposals set status='expired',closed_at=clock_timestamp() where clan_id=p_clan and status='pending' and expires_at<=clock_timestamp();
 return jsonb_build_object('paidSlots',c.paid_slots,'nextSlotCost',case when c.paid_slots<15 then 50+c.paid_slots*25 end,'decorations',c.shop_decorations,
 'catalog',(select jsonb_agg(to_jsonb(s)||jsonb_build_object('owned',exists(select 1 from public.rewards_clan_shop_items i where i.clan_id=p_clan and i.item_id=s.id)) order by s.kind,s.price) from public.rewards_clan_shop_catalog s),
 'proposals',(select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]') from (
 select p.id,p.label,p.amount,p.status,p.eligible,p.created_at,p.expires_at,p.eligible/2+1 as required,
 (select count(*) from public.rewards_clan_spend_votes v where v.proposal_id=p.id and v.approve) as yes,
 (select count(*) from public.rewards_clan_spend_votes v where v.proposal_id=p.id and not v.approve) as no,
 (select v.approve from public.rewards_clan_spend_votes v where v.proposal_id=p.id and v.membership_id=m) as my_vote
 from public.rewards_clan_spend_proposals p where p.clan_id=p_clan order by p.created_at desc limit 20) q));
end$$;
create or replace function public.rewards_clan_api(p_actor text,p_action text,p_body jsonb default '{}') returns jsonb language plpgsql set search_path='' as $$
declare me public.rewards_users; c public.rewards_clans; mine uuid; target uuid; req uuid; n int; lvl int; bp int; sp int; cost int; p date:=public.rewards_clan_period(clock_timestamp()); season_start date;season_end date;cp_now timestamptz; result jsonb; name_text text; avatar_text text; visit uuid; can_visit boolean; visiting boolean:=false;
begin
 if jsonb_typeof(p_body) is distinct from 'object' then raise exception 'invalid_request';end if;
 select * into me from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false);if not found then raise exception 'user_unavailable';end if;
 perform public.rewards_clan_tick();
 cp_now:=clock_timestamp();season_start:=public.rewards_clan_season_start(cp_now);season_end:=public.rewards_clan_season_end(season_start);
 select clan_id into mine from public.rewards_clan_members where user_id=me.id and left_at is null;
 can_visit:=public.rewards_clan_is_site_owner(p_actor);
 if can_visit then select clan_id into visit from public.rewards_clan_owner_visits where user_id=me.id;end if;
 if p_action in('owner_enter','owner_exit') then
   if not can_visit then raise exception 'owner_required';end if;
   if p_action='owner_enter' then
     target:=(p_body->>'clanId')::uuid;
     if not exists(select 1 from public.rewards_clans where id=target) then raise exception 'not_found';end if;
     if visit is not null and visit is distinct from target then
       delete from public.rewards_clan_owner_visits where user_id=me.id;
       insert into public.rewards_clan_moderation(clan_id,actor,action) values(visit,p_actor,'owner_exit');
     end if;
     if target is distinct from mine and target is distinct from visit then
       insert into public.rewards_clan_owner_visits(user_id,clan_id) values(me.id,target) on conflict(user_id) do update set clan_id=excluded.clan_id,entered_at=clock_timestamp();
       insert into public.rewards_clan_moderation(clan_id,actor,action) values(target,p_actor,'owner_enter');
     end if;
     return jsonb_build_object('id',target,'ok',true);
   end if;
   if visit is not null and (p_body->>'clanId')::uuid is distinct from visit then raise exception 'invalid_request';end if;
   if visit is not null then
     delete from public.rewards_clan_owner_visits where user_id=me.id;
     insert into public.rewards_clan_moderation(clan_id,actor,action) values(visit,p_actor,'owner_exit');
   end if;
   return jsonb_build_object('ok',true);
 end if;
 if p_action='list' then
 with ranking as materialized (select * from public.rewards_clan_cp_rank(season_start,cp_now))
 select jsonb_build_object('mine',mine,'canVisit',can_visit,'visit',visit,'seasonStart',season_start,'seasonEnd',season_end,'serverNow',cp_now,
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
 if (select count(*) from public.rewards_clan_members where clan_id=c.id and left_at is null)>=public.rewards_clan_capacity(c.cxp,c.paid_slots) then raise exception 'clan_full';end if;
 insert into public.rewards_clan_requests(clan_id,user_id) values(c.id,me.id) on conflict do nothing;return jsonb_build_object('ok',true);
 end if;
 visiting:=can_visit and visit=c.id and mine is distinct from c.id;
 if p_action='detail' and mine is distinct from c.id and not coalesce(visiting,false) then return jsonb_build_object('id',c.id,'name',c.name,'avatar',c.avatar,'level',public.rewards_clan_level(c.cxp),'member',false,'canVisit',can_visit,'pending',exists(select 1 from public.rewards_clan_requests where clan_id=c.id and user_id=me.id));end if;
 if mine is distinct from c.id and not (coalesce(visiting,false) and p_action='detail') then raise exception 'member_required';end if;
 if p_action in('settings','approve','reject','kick','cosmetic') and c.owner_id<>me.id then raise exception 'leader_required';end if;
 if p_action='settings' then name_text:=trim(p_body->>'name');if char_length(name_text) not between 3 and 32 or name_text ~ '[[:cntrl:]]' then raise exception 'invalid_request';end if;update public.rewards_clans set name=name_text,avatar=case when p_body?'avatar' then nullif(p_body->>'avatar','') else avatar end,min_level=(p_body->>'minLevel')::int,min_bp=(p_body->>'minBp')::int where id=c.id;
 elsif p_action='cosmetic' then
 n:=(p_body->>'reward')::int;name_text:=case when n=any(array[2,12,21,30,40,49,56,65]) then 'frame' when n=any(array[6,11,23,35,45,52,62]) then 'background' when n=any(array[7,15,33,37,51]) then 'tag' when n=any(array[9,31,43]) then 'badge' when n=any(array[14,27,38,59]) then 'flag' when n=any(array[18,28,39,47,57,64]) then 'banner' when n=any(array[20,50,60]) then 'medal' when n=any(array[26,34,46,58,67]) then 'title' when n=any(array[17,24,42,55,66]) then 'effect' end;
 if name_text is null or n>public.rewards_clan_level(c.cxp) then raise exception 'requirements';end if;
 update public.rewards_clans set decorations=decorations||jsonb_build_object(name_text,n),shop_decorations=shop_decorations-name_text where id=c.id;
 elsif p_action in('approve','reject','kick') then
 target:=(p_body->>'userId')::uuid;if target=c.owner_id then raise exception 'invalid_request';end if;
 if p_action='kick' then update public.rewards_clan_members set left_at=clock_timestamp() where clan_id=c.id and user_id=target and left_at is null;
 else if not exists(select 1 from public.rewards_clan_requests where clan_id=c.id and user_id=target) then raise exception 'not_found';end if;
 if p_action='approve' then if not public.rewards_clan_eligible(target,c.min_level,c.min_bp) then raise exception 'requirements';end if;perform 1 from public.rewards_clans where id=c.id for update;if (select count(*) from public.rewards_clan_members where clan_id=c.id and left_at is null)>=public.rewards_clan_capacity(c.cxp,c.paid_slots) then raise exception 'clan_full';end if;insert into public.rewards_clan_members(clan_id,user_id) values(c.id,target);delete from public.rewards_clan_requests where user_id=target;else delete from public.rewards_clan_requests where clan_id=c.id and user_id=target;end if;end if;
 elsif p_action='leave' then if c.owner_id=me.id then raise exception 'leader_required';end if;update public.rewards_clan_members set left_at=clock_timestamp() where clan_id=c.id and user_id=me.id and left_at is null;return jsonb_build_object('ok',true);
 elsif p_action in('shop_propose','shop_vote','shop_equip') then
 perform public.rewards_clan_shop_action(c.id,me.id,p_action,p_body);
 elsif p_action='deposit' then
 perform 1 from public.rewards_users where id=me.id and not coalesce(participation_restricted,false) for update;if not found then raise exception 'user_unavailable';end if;
 perform 1 from public.rewards_clans where id=c.id for update;
 n:=(p_body->>'amount')::int;req:=(p_body->>'requestId')::uuid;if n is null or n not between 1 and 100000 or req is null then raise exception 'invalid_request';end if;
 if exists(select 1 from public.rewards_clan_ledger where request_id=req and user_id=me.id and clan_id=c.id and kind='deposit') then return jsonb_build_object('ok',true);end if;
 if (select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=me.id)<n then raise exception 'insufficient_coins';end if;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(me.id,-n,'adjustment','Пополнение общака клана');
 update public.rewards_clans set treasury=treasury+n where id=c.id;
 insert into public.rewards_clan_ledger(clan_id,user_id,amount,kind,request_id) values(c.id,me.id,n,'deposit',req);
 perform public.rewards_clan_record('deposit',req::text,me.id,n,clock_timestamp());
 elsif p_action='chat' then if char_length(trim(p_body->>'message')) not between 1 and 240 then raise exception 'invalid_request';end if;insert into public.rewards_clan_chat(clan_id,user_id,message) values(c.id,me.id,trim(p_body->>'message'));
 elsif p_action<>'detail' then raise exception 'invalid_request';end if;
 perform public.rewards_clan_tick();
 select * into c from public.rewards_clans where id=c.id;
 return jsonb_build_object('id',c.id,'name',c.name,'avatar',c.avatar,'member',true,'visitor',coalesce(visiting,false),'leader',c.owner_id=me.id,'level',public.rewards_clan_level(c.cxp),'cxp',c.cxp,'cp',(select s.cp from public.rewards_clan_cp_scores(season_start,clock_timestamp(),c.id) s),'streamCp',(select count(*) from public.rewards_clan_chat_cp_awards a where a.clan_id=c.id and a.season_start=public.rewards_clan_season_start(clock_timestamp())),'capacity',public.rewards_clan_capacity(c.cxp,c.paid_slots),'extraSlot',c.extra_slot,'shop',public.rewards_clan_shop_state(c.id,me.id),'treasury',c.treasury,'minLevel',c.min_level,'minBp',c.min_bp,'decorations',c.decorations,'period',p,'ends',case when p=date '2026-11-20' then date '2026-11-30' else p+7 end,
 'members',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'login',u.twitch_login,'owner',u.id=c.owner_id,'self',u.id=me.id)),'[]') from public.rewards_clan_members m join public.rewards_users u on u.id=m.user_id where m.clan_id=c.id and m.left_at is null),
 'requests',case when c.owner_id=me.id then (select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'login',u.twitch_login)),'[]') from public.rewards_clan_requests r join public.rewards_users u on u.id=r.user_id where r.clan_id=c.id) else '[]'::jsonb end,
 'tasks',(select coalesce(jsonb_agg(jsonb_build_object('source',t.source,'label',t.label,'target',t.target,'cxp',t.cxp,'cpRate',public.rewards_clan_cp_rate(t.source),'progress',coalesce((select sum(e.amount) from public.rewards_clan_events e where e.clan_id=c.id and e.source=t.source and public.rewards_clan_period(e.occurred_at)=p),0),'done',exists(select 1 from public.rewards_clan_task_awards a where a.clan_id=c.id and a.period=p and a.source=t.source))),'[]') from public.rewards_clan_tasks t where t.period=p),
 'chat',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]') from (select u.twitch_login login,h.message,h.created_at from public.rewards_clan_chat h join public.rewards_users u on u.id=h.user_id where h.clan_id=c.id order by h.created_at desc limit 60)x),
 'ledger',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') from (select l.amount,l.kind,l.description,l.created_at,u.twitch_login login from public.rewards_clan_ledger l left join public.rewards_users u on u.id=l.user_id where l.clan_id=c.id order by l.created_at desc limit 30)x));
end $$;
notify pgrst,'reload schema';
