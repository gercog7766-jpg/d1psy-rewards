-- Permanent Dropso levels; Battle Pass, clan CXP/CP and boss rewards are unchanged.
create function public.rewards_dropso_level_threshold(p_level integer) returns integer
language sql immutable set search_path='' as $$
 with q as(select greatest(1,least(100,p_level)) l)
 select case when l<=50 then round(37.5*(l-1)*(l+2))::int
 when l<=60 then 95550+4500*(l-50)+150*(l-50)*(l-51)
 when l<=80 then 154050+7500*(l-60)+250*(l-60)*(l-61)
 else 399050+17500*(l-80)+375*(l-80)*(l-81) end from q
$$;
create or replace function public.rewards_level_from_xp(p_xp integer) returns integer
language sql immutable set search_path='' as $$
 select coalesce(max(n),1) from generate_series(1,100) n where public.rewards_dropso_level_threshold(n)<=greatest(0,p_xp)
$$;
create table public.rewards_level_v2_claims(
 user_id uuid not null references public.rewards_users(id),level int not null check(level in(60,70,80,90,100)),
 coins int not null check(coins>0),equipped boolean not null default true,claimed_at timestamptz not null default now(),primary key(user_id,level)
);
alter table public.rewards_level_v2_claims enable row level security;
revoke all on public.rewards_level_v2_claims from public,anon,authenticated;
grant select,insert,update on public.rewards_level_v2_claims to service_role;
create function public.rewards_claim_level_reward_v2(p_user_id uuid,p_level integer) returns jsonb
language plpgsql set search_path='' as $$
declare xp integer; amount integer;
begin
 amount:=case p_level when 60 then 350 when 70 then 500 when 80 then 750 when 90 then 1000 when 100 then 1500 end;
 if amount is null then return jsonb_build_object('ok',false,'error','invalid_level');end if;
 select xp_total into xp from public.rewards_users where id=p_user_id and not coalesce(banned,false) for update;
 if not found then return jsonb_build_object('ok',false,'error','user_unavailable');end if;
 if public.rewards_level_from_xp(xp)<p_level then return jsonb_build_object('ok',false,'error','level_locked');end if;
 insert into public.rewards_level_v2_claims(user_id,level,coins) values(p_user_id,p_level,amount) on conflict do nothing;
 if not found then return jsonb_build_object('ok',true,'already_claimed',true);end if;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user_id,amount,'level_reward','Dropso LEVEL · LVL '||p_level);
 return jsonb_build_object('ok',true,'coins',amount,'level',p_level);
end$$;
create function public.rewards_level_v2_equip(p_user_id uuid,p_level integer,p_equipped boolean) returns jsonb
language plpgsql set search_path='' as $$
begin
 if p_level not in(60,70,80,90) or p_equipped is null then return jsonb_build_object('ok',false,'error','invalid_cosmetic');end if;
 perform 1 from public.rewards_users where id=p_user_id and not coalesce(banned,false) for update;
 if not found then return jsonb_build_object('ok',false,'error','user_unavailable');end if;
 update public.rewards_level_v2_claims set equipped=p_equipped where user_id=p_user_id and level=p_level;
 if not found then return jsonb_build_object('ok',false,'error','cosmetic_locked');end if;
 return jsonb_build_object('ok',true,'equipped',p_equipped);
end$$;
-- Existing levels above 50 keep their rank and relative progress after the curve changes.
-- No XP is subtracted. The transition adjustment is explicitly recorded in XP history.
do $$declare r record; old_level int; old_from int; old_to int; new_xp int; begin
 for r in select id,xp_total from public.rewards_users where xp_total>=99375 order by id for update loop
  old_level:=least(100,greatest(1,floor((sqrt(9+8*greatest(r.xp_total,0)/75.0)-3)/2)::int+1));
  old_from:=round(37.5*(old_level-1)*(old_level+2))::int;old_to:=round(37.5*old_level*(old_level+3))::int;
  new_xp:=public.rewards_dropso_level_threshold(old_level);
  if old_level<100 then new_xp:=new_xp+floor((r.xp_total-old_from)::numeric*(public.rewards_dropso_level_threshold(old_level+1)-new_xp)/(old_to-old_from))::int;end if;
  if new_xp>r.xp_total then perform public.rewards_award_xp(r.id,new_xp-r.xp_total,'Переход на Dropso LEVEL 2.0','admin_adjustment','dropso-level-transition-2026');end if;
 end loop;
end$$;
revoke all on function public.rewards_dropso_level_threshold(integer),public.rewards_level_from_xp(integer),public.rewards_claim_level_reward_v2(uuid,integer),public.rewards_level_v2_equip(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.rewards_dropso_level_threshold(integer),public.rewards_level_from_xp(integer),public.rewards_claim_level_reward_v2(uuid,integer),public.rewards_level_v2_equip(uuid,integer,boolean) to service_role;
create or replace function public.rewards_clan_eligible(p_user uuid,p_min_level int,p_min_bp int) returns boolean language plpgsql stable set search_path='' as $$
declare xp int;sp int;bp int:=0;n int;cost int;begin
 select xp_total into xp from public.rewards_users where id=p_user and not coalesce(banned,false) and not coalesce(participation_restricted,false);if not found then return false;end if;
 if public.rewards_level_from_xp(xp)<p_min_level then return false;end if;
 select coalesce((select s.sp from public.rewards_season_progress s where s.user_id=p_user and s.season_id='s1'),0) into sp;
 for n in 1..50 loop cost:=case when n<=4 then 500 when n<=10 then 750 when n<=15 then 1000 when n<=29 then 1250 when n<=40 then 1500 else 2000 end;exit when sp<cost;sp:=sp-cost;bp:=bp+1;end loop;
 return bp>=p_min_bp;
end $$;
create or replace function public.rewards_set_level_cosmetics(p_user_id uuid,p_frame text,p_color text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare xp integer;lv integer;required_lv integer;
begin
 select xp_total into xp from public.rewards_users where id=p_user_id and not banned for update;
 if not found then return jsonb_build_object('ok',false,'error','user_unavailable');end if;
 lv:=public.rewards_level_from_xp(xp);
 if p_frame is null or p_color is null or p_frame not in('none','frame1','frame2','rare','s1') or p_color not in('default','violet','gold','s1') then return jsonb_build_object('ok',false,'error','invalid_cosmetic');end if;
 required_lv:=case p_frame when 'frame1' then 5 when 'frame2' then 25 when 'rare' then 45 else 1 end;
 if lv<required_lv or lv<(case p_color when 'violet' then 15 when 'gold' then 35 else 1 end) then return jsonb_build_object('ok',false,'error','cosmetic_locked');end if;
 if (p_frame='s1' and not exists(select 1 from public.rewards_season_reward_claims where user_id=p_user_id and season_id='s1' and level=23)) or (p_color='s1' and not exists(select 1 from public.rewards_season_reward_claims where user_id=p_user_id and season_id='s1' and level=21)) then return jsonb_build_object('ok',false,'error','cosmetic_locked');end if;
 update public.rewards_users set level_frame=p_frame,level_color=p_color,updated_at=now() where id=p_user_id;
 return jsonb_build_object('ok',true,'frame',p_frame,'color',p_color);
end $$;
notify pgrst,'reload schema';
