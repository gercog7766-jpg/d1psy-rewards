-- All rewards are fixed by season/level, issued atomically into existing accounts.
create table public.rewards_season_reward_claims(
 user_id uuid not null references public.rewards_users(id),season_id text not null check(season_id='s1'),level integer not null check(level between 1 and 50),
 reward_type text not null check(reward_type in('coins','color','xp','frame','item','final')),amount integer not null default 0 check(amount>=0),
 win_id uuid unique references public.rewards_wins(id),created_at timestamptz not null default now(),primary key(user_id,season_id,level)
);
alter table public.rewards_season_reward_claims enable row level security;
revoke all on public.rewards_season_reward_claims from public,anon,authenticated;
grant select,insert on public.rewards_season_reward_claims to service_role;
create function public.rewards_claim_season_reward(p_user_id uuid,p_season_id text,p_level integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_sp integer;v_claimed integer[];v_required integer:=0;v_i integer;v_amount integer:=0;v_kind text;v_prize uuid;v_win uuid;
v_costs integer[]:=array[500,500,500,500,750,750,750,750,750,750,1000,1000,1000,1000,1000,1250,1250,1250,1250,1250,1250,1250,1250,1250,1250,1250,1250,1250,1250,1250,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,2000,2000,2000,2000,2000,2000,2000,2000,2000,2000];
begin
 if p_season_id is distinct from 's1' or p_level is null or p_level not between 1 and 50 then return jsonb_build_object('ok',false,'error','invalid_reward');end if;
 if not exists(select 1 from public.rewards_users where id=p_user_id and not banned and not participation_restricted) then return jsonb_build_object('ok',false,'error','user_unavailable');end if;
 insert into public.rewards_season_progress(user_id,season_id,sp,claimed_levels) values(p_user_id,p_season_id,0,'{}'::integer[]) on conflict(user_id,season_id) do nothing;
 select sp,coalesce(claimed_levels,'{}'::integer[]) into v_sp,v_claimed from public.rewards_season_progress where user_id=p_user_id and season_id=p_season_id for update;
 if p_level=any(v_claimed) then return jsonb_build_object('ok',false,'error','already_claimed');end if;
 for v_i in 1..p_level loop v_required:=v_required+v_costs[v_i];end loop;
 if v_sp<v_required then return jsonb_build_object('ok',false,'error','level_locked');end if;
 if p_level=21 then v_kind:='color';
 elsif p_level=22 then v_kind:='xp';v_amount:=300;perform public.rewards_award_xp(p_user_id,300,'Night Shift · LVL 22','season_reward','s1:22');
 elsif p_level=23 then v_kind:='frame';
 elsif p_level in(24,50) then
  v_kind:=case when p_level=50 then 'final' else 'item' end;
  -- Use existing catalog rewards; never enable them in drops or the shop here.
  select id into v_prize from public.rewards_prizes where unlimited and name=case when p_level=24 then 'Наклейка | Бицепс' else 'AWP | Экзотермия FT' end order by id limit 1;
  if v_prize is null then raise exception 'season_prize_missing';end if;
  insert into public.rewards_wins(user_id,prize_id,source_type,item_wear,item_variant_kind) values(p_user_id,v_prize,'season',case when p_level=50 then 'FT' else null end,case when p_level=50 then 'normal' else null end) returning id into v_win;
 else
  v_kind:='coins';v_amount:=case when p_level<=2 then 5 when p_level<=4 then 7 when p_level<=10 then 10 when p_level<=15 then 15 when p_level<=20 then 20 when p_level<=30 then 30 when p_level<=40 then 50 else 80 end;
  insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(p_user_id,v_amount,'level_reward','Battle Pass S1 · LVL '||p_level);
 end if;
 insert into public.rewards_season_reward_claims(user_id,season_id,level,reward_type,amount,win_id) values(p_user_id,p_season_id,p_level,v_kind,v_amount,v_win);
 update public.rewards_season_progress set claimed_levels=array_append(coalesce(claimed_levels,'{}'::integer[]),p_level),updated_at=now() where user_id=p_user_id and season_id=p_season_id;
 return jsonb_build_object('ok',true,'level',p_level,'rewardType',v_kind,'amount',v_amount,'winId',v_win,'badge',p_level=50);
end $$;
-- Compatibility entry point cannot choose a reward amount or claim a special reward as coins.
create or replace function public.rewards_claim_season_coin_reward(p_user_id uuid,p_season_id text,p_level integer,p_amount integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare expected integer;
begin
 expected:=case when p_level between 1 and 2 then 5 when p_level between 3 and 4 then 7 when p_level between 5 and 10 then 10 when p_level between 11 and 15 then 15 when p_level between 16 and 20 then 20 when p_level between 25 and 30 then 30 when p_level between 31 and 40 then 50 when p_level between 41 and 49 then 80 else 0 end;
 if expected=0 or p_amount is distinct from expected then return jsonb_build_object('ok',false,'error','invalid_reward');end if;
 return public.rewards_claim_season_reward(p_user_id,p_season_id,p_level);
end $$;
create function public.rewards_set_level_cosmetics(p_user_id uuid,p_frame text,p_color text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare xp integer;lv integer;required_lv integer;
begin
 select xp_total into xp from public.rewards_users where id=p_user_id and not banned for update;
 if not found then return jsonb_build_object('ok',false,'error','user_unavailable');end if;
 lv:=greatest(1,floor((sqrt(9+8*greatest(xp,0)/75.0)-3)/2)::integer+1);
 if p_frame is null or p_color is null or p_frame not in('none','frame1','frame2','rare','s1') or p_color not in('default','violet','gold','s1') then return jsonb_build_object('ok',false,'error','invalid_cosmetic');end if;
 required_lv:=case p_frame when 'frame1' then 5 when 'frame2' then 25 when 'rare' then 45 else 1 end;
 if lv<required_lv or lv<(case p_color when 'violet' then 15 when 'gold' then 35 else 1 end) then return jsonb_build_object('ok',false,'error','cosmetic_locked');end if;
 if (p_frame='s1' and not exists(select 1 from public.rewards_season_reward_claims where user_id=p_user_id and season_id='s1' and level=23)) or (p_color='s1' and not exists(select 1 from public.rewards_season_reward_claims where user_id=p_user_id and season_id='s1' and level=21)) then return jsonb_build_object('ok',false,'error','cosmetic_locked');end if;
 update public.rewards_users set level_frame=p_frame,level_color=p_color,updated_at=now() where id=p_user_id;
 return jsonb_build_object('ok',true,'frame',p_frame,'color',p_color);
end $$;
revoke all on function public.rewards_claim_season_reward(uuid,text,integer),public.rewards_claim_season_coin_reward(uuid,text,integer,integer),public.rewards_set_level_cosmetics(uuid,text,text) from public,anon,authenticated;
grant execute on function public.rewards_claim_season_reward(uuid,text,integer),public.rewards_claim_season_coin_reward(uuid,text,integer,integer),public.rewards_set_level_cosmetics(uuid,text,text) to service_role;
