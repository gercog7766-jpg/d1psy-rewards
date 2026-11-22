-- Preserve every current run, its HP and existing hit history.
alter table public.rewards_boss_runs add column regen_observed_at timestamptz, add column regen_live boolean not null default false, add column regen_seconds numeric not null default 0 check(regen_seconds>=0 and regen_seconds<60);
alter table public.rewards_boss_hits add column hit_kind text not null default 'normal' check(hit_kind in ('normal','critical','multishot'));

-- Only verified consecutive stream samples count. A paused, hidden or defeated boss never regenerates.
create function public.rewards_boss_regen_sample(p_broadcaster text,p_at timestamptz,p_live boolean) returns int
language plpgsql set search_path='' as $$
declare b public.rewards_boss_runs; seconds numeric:=0; heal int:=0;
begin
 if p_at is null or abs(extract(epoch from p_at-clock_timestamp()))>90 or p_live is null then raise exception 'invalid_sample';end if;
 if not exists(select 1 from public.rewards_streamers where twitch_broadcaster_id=p_broadcaster and is_primary and enabled) then raise exception 'primary_required';end if;
 perform pg_advisory_xact_lock(78104921);
 select * into b from public.rewards_boss_runs where status='active' and not hidden and hp>0 for update;
 if not found or p_at<b.active_since or (b.regen_observed_at is not null and p_at<=b.regen_observed_at) then return 0;end if;
 if p_live and b.regen_live and b.regen_observed_at>=b.active_since and p_at-b.regen_observed_at<=interval '90 seconds' and b.hp<b.max_hp then
  seconds:=b.regen_seconds+extract(epoch from p_at-b.regen_observed_at);
  heal:=least(b.max_hp-b.hp,floor(seconds/60)::int);
  seconds:=case when b.hp+heal>=b.max_hp then 0 else mod(seconds,60) end;
 end if;
 update public.rewards_boss_runs set hp=hp+heal,regen_observed_at=p_at,regen_live=p_live,regen_seconds=seconds where id=b.id;
 return heal;
end$$;
revoke all on function public.rewards_boss_regen_sample(text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.rewards_boss_regen_sample(text,timestamptz,boolean) to service_role;

create or replace function public.rewards_boss_hit(p_source text,p_event text,p_actor text,p_donor text default null,p_rub numeric default null,p_gifts int default 1,p_code uuid default null,p_at timestamptz default null,p_confirmed boolean default true) returns jsonb
language plpgsql set search_path='' as $$
declare b public.rewards_boss_runs; u uuid; dmg int; sec bigint; stamp timestamptz:=clock_timestamp(); prev bigint; roll int; hit_kind text:='normal'; cooldown_seconds int:=1800;
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
   roll:=public.rewards_crypto_index(100);
   if roll<5 then hit_kind:='critical';dmg:=90+public.rewards_crypto_index(21);
   elsif roll=5 then hit_kind:='multishot';dmg:=35+public.rewards_crypto_index(11);cooldown_seconds:=0;
   else dmg:=35+public.rewards_crypto_index(11);end if;
  elsif p_source='subscription' then dmg:=150;
  else if p_gifts not between 1 and 1000 then raise exception 'invalid_gifts';end if;dmg:=150*p_gifts;end if;
 else
  if p_rub is null or p_rub<=0 or p_rub>10000000 then raise exception 'invalid_amount';end if;
  select id into u from public.rewards_users where (id=p_code or (p_code is null and lower(twitch_login)=lower(p_donor))) and not coalesce(banned,false) and not coalesce(participation_restricted,false);
  if u is null and p_code is not null then select id into u from public.rewards_users where lower(twitch_login)=lower(p_donor) and not coalesce(banned,false) and not coalesce(participation_restricted,false);end if;
  if public.rewards_crypto_index(100)<50 then hit_kind:='critical';dmg:=floor(p_rub*(250+public.rewards_crypto_index(151))/100);else dmg:=floor(p_rub*2);end if;
 end if;
 dmg:=least(dmg,b.hp);if dmg<=0 then raise exception 'invalid_damage';end if;
 insert into public.rewards_boss_hits(run_id,user_id,source,event_id,donor,amount_rub,damage,active_second,confirmed,hit_kind) values(b.id,u,p_source,p_event,left(p_donor,100),p_rub,dmg,sec,p_confirmed,hit_kind);
 if p_source='free' then insert into public.rewards_boss_cooldowns(run_id,user_id,remaining_seconds,last_attack_at) values(b.id,u,cooldown_seconds,stamp) on conflict(run_id,user_id) do update set remaining_seconds=excluded.remaining_seconds,last_attack_at=stamp;end if;
 update public.rewards_boss_runs set hp=hp-dmg,regen_observed_at=case when hp=max_hp and regen_observed_at is not null then greatest(regen_observed_at,stamp) else regen_observed_at end,regen_seconds=case when hp=max_hp then 0 else regen_seconds end,status=case when hp=dmg then 'review' else status end,elapsed_seconds=case when hp=dmg then sec else elapsed_seconds end,active_since=case when hp=dmg then null else active_since end where id=b.id;
 return jsonb_build_object('damage',dmg,'hp',b.hp-dmg,'kind',hit_kind,'cooldown',case when p_source='free' then cooldown_seconds else null end);
end$$;

create or replace function public.rewards_boss_control(p_actor text,p_action text,p_body jsonb default '{}') returns jsonb
language plpgsql set search_path='' as $$
declare b public.rewards_boss_runs; k text; h int; c int; x int; stamp timestamptz:=clock_timestamp(); a record; target uuid; denominator numeric;
begin
 if not exists(select 1 from public.rewards_streamers where is_primary and enabled and twitch_broadcaster_id=p_actor) then raise exception 'owner_required';end if;
 perform pg_advisory_xact_lock(78104921);
 select * into b from public.rewards_boss_runs where status in ('active','paused','review') for update;
 if p_action in ('start','switch') then
  if p_action='start' and b.id is not null then raise exception 'boss_exists';end if;
  if p_action='switch' and b.status='review' then raise exception 'settle_current_boss_first';end if;
  k:=p_body->>'kind'; h:=case k when 'dropsy' then 5000 when 'guardian' then 10000 when 'titan' then 25000 end;
  if h is null then raise exception 'invalid_kind';end if;
  if b.id is not null and b.kind=k then raise exception 'same_boss';end if;
  if b.id is not null then update public.rewards_boss_runs set status='parked',hidden=true,elapsed_seconds=elapsed_seconds+case when status='active' then greatest(0,floor(extract(epoch from stamp-active_since))::bigint) else 0 end,active_since=null where id=b.id;end if;
  select * into b from public.rewards_boss_runs where status='parked' and kind=k for update;
  if b.id is not null then
   update public.rewards_boss_runs set status='active',hidden=false,active_since=stamp where id=b.id;
  else
   c:=coalesce((p_body->>'coins')::int,h/10); x:=coalesce((p_body->>'xp')::int,h/2);
   insert into public.rewards_boss_runs(kind,max_hp,hp,coins,xp,status,active_since) values(k,h,h,c,x,'active',stamp) returning * into b;
  end if;
 elsif p_action='disable' then
  if b.id is null then select * into b from public.rewards_boss_runs where status='paid' order by finished_at desc nulls last,created_at desc limit 1 for update;end if;
  if b.id is null then raise exception 'no_boss';end if;
  update public.rewards_boss_runs set hidden=true,status=case when status='active' then 'paused' else status end,elapsed_seconds=elapsed_seconds+case when status='active' then greatest(0,floor(extract(epoch from stamp-active_since))::bigint) else 0 end,active_since=null where id=b.id;
 elsif b.id is null then raise exception 'no_boss';
 elsif p_action='pause' and b.status='active' then
  update public.rewards_boss_runs set status='paused',elapsed_seconds=elapsed_seconds+greatest(0,floor(extract(epoch from stamp-active_since))::bigint),active_since=null where id=b.id;
 elsif p_action='resume' and b.status='paused' then
  update public.rewards_boss_runs set status='active',hidden=false,active_since=stamp where id=b.id;
 elsif p_action='identify' and b.status in ('active','paused','review') then
  if nullif(p_body->>'login','') is not null then
   select id into target from public.rewards_users where lower(twitch_login)=lower(p_body->>'login') and not coalesce(banned,false) and not coalesce(participation_restricted,false);
   if target is null then raise exception 'unknown_user';end if;
  end if;
  update public.rewards_boss_hits set user_id=target where run_id=b.id and id=(p_body->>'hitId')::uuid and source in ('donationalerts','ihaq');
  if not found then raise exception 'unknown_hit';end if;
 elsif p_action='confirm_donation' and b.status in ('active','paused','review') then
  update public.rewards_boss_hits set confirmed=true where run_id=b.id and id=(p_body->>'hitId')::uuid and source in ('donationalerts','ihaq') and not rejected;
  if not found then raise exception 'unknown_hit';end if;
 elsif p_action='reject_donation' and b.status in ('active','paused','review') then
  update public.rewards_boss_hits set rejected=true where run_id=b.id and id=(p_body->>'hitId')::uuid and source in ('donationalerts','ihaq') and not rejected returning damage into h;
  if not found then raise exception 'unknown_hit';end if;
  update public.rewards_boss_runs set hp=least(max_hp,hp+h),status=case when status='review' then 'paused' else status end where id=b.id;
 elsif p_action='pay' and b.status='review' then
  if exists(select 1 from public.rewards_boss_hits where run_id=b.id and not confirmed and not rejected) then raise exception 'donations_require_review';end if;
  select greatest(b.max_hp,coalesce(sum(damage),0)) into denominator from public.rewards_boss_hits where run_id=b.id and not rejected;
  for a in select h.user_id,sum(h.damage)::int damage from public.rewards_boss_hits h join public.rewards_users u on u.id=h.user_id where h.run_id=b.id and not h.rejected and not coalesce(u.banned,false) and not coalesce(u.participation_restricted,false) group by h.user_id order by h.user_id loop
   c:=floor(b.coins::numeric*a.damage/denominator);x:=floor(b.xp::numeric*a.damage/denominator);
   insert into public.rewards_boss_awards values(b.id,a.user_id,a.damage,c,x);
   if c>0 then insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(a.user_id,c,'adjustment','LIVE BOSS · '||b.id);end if;
   if x>0 then perform public.rewards_award_xp(a.user_id,x,'LIVE BOSS','boss_reward',b.id::text);end if;
   if a.damage>=150 then insert into public.rewards_live_achievement_progress(user_id,bosses) values(a.user_id,1) on conflict(user_id) do update set bosses=rewards_live_achievement_progress.bosses+1;end if;
  end loop;
  update public.rewards_boss_runs set status='paid',finished_at=stamp where id=b.id;
 else raise exception 'invalid_action';end if;
 return jsonb_build_object('ok',true,'id',b.id);
end$$;

notify pgrst,'reload schema';
