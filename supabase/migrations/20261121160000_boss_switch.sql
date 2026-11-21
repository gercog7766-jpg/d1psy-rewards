-- Park unfinished runs rather than discarding player contribution or paid events.
alter table public.rewards_boss_runs add column hidden boolean not null default false, add column finished_at timestamptz;
update public.rewards_boss_runs set finished_at=created_at where status='paid';
alter table public.rewards_boss_runs drop constraint rewards_boss_runs_status_check,
 add constraint rewards_boss_runs_status_check check(status in ('active','paused','review','paid','parked'));
drop index public.rewards_boss_one_open;
create unique index rewards_boss_one_open on public.rewards_boss_runs((true)) where status in ('active','paused','review');
create unique index rewards_boss_one_parked_kind on public.rewards_boss_runs(kind) where status='parked';
create or replace function public.rewards_boss_control(p_actor text,p_action text,p_body jsonb default '{}') returns jsonb
language plpgsql set search_path='' as $$
declare b public.rewards_boss_runs; k text; h int; c int; x int; stamp timestamptz:=clock_timestamp(); a record; target uuid;
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
  update public.rewards_boss_runs set hp=hp+h,status=case when status='review' then 'paused' else status end where id=b.id;
 elsif p_action='pay' and b.status='review' then
  if exists(select 1 from public.rewards_boss_hits where run_id=b.id and not confirmed and not rejected) then raise exception 'donations_require_review';end if;
  for a in select h.user_id,sum(h.damage)::int damage from public.rewards_boss_hits h join public.rewards_users u on u.id=h.user_id where h.run_id=b.id and not h.rejected and not coalesce(u.banned,false) and not coalesce(u.participation_restricted,false) group by h.user_id order by h.user_id loop
   c:=floor(b.coins::numeric*a.damage/b.max_hp);x:=floor(b.xp::numeric*a.damage/b.max_hp);
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
