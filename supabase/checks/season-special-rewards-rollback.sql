-- Verification only. All awards, XP, settings, orders and sale credits roll back.
begin;
set local role service_role;
do $$
declare u public.rewards_users;r jsonb;lv integer;w24 uuid;w50 uuid;xp_before integer;wins_before bigint;status_before jsonb;
begin
 select * into u from public.rewards_users where not banned and not participation_restricted order by xp_total desc,id limit 1;
 if u.id is null then raise exception 'missing_verification_user';end if;
 xp_before:=u.xp_total;select count(*) into wins_before from public.rewards_wins where user_id=u.id;
 select jsonb_agg(jsonb_build_object('id',id,'status',status) order by id) into status_before from public.rewards_prizes where name in('Наклейка | Бицепс','AWP | Экзотермия FT');
 insert into public.rewards_season_progress(user_id,season_id,sp) values(u.id,'s1',65250) on conflict(user_id,season_id) do update set sp=65250;
 foreach lv in array array[21,22,23,24,50] loop
  r:=public.rewards_claim_season_reward(u.id,'s1',lv);if r->>'ok'<>'true' then raise exception 'claim failed % %',lv,r;end if;
  r:=public.rewards_claim_season_reward(u.id,'s1',lv);if r->>'error'<>'already_claimed' then raise exception 'duplicate award %',lv;end if;
 end loop;
 if (select xp_total from public.rewards_users where id=u.id)<>xp_before+300 then raise exception 'incorrect_xp';end if;
 if (select count(*) from public.rewards_wins where user_id=u.id)<>wins_before+2 then raise exception 'incorrect_inventory';end if;
 r:=public.rewards_set_level_cosmetics(u.id,'s1','s1');if r->>'ok'<>'true' then raise exception 'season_cosmetics_not_unlocked';end if;
 select win_id into w24 from public.rewards_season_reward_claims where user_id=u.id and season_id='s1' and level=24;
 select win_id into w50 from public.rewards_season_reward_claims where user_id=u.id and season_id='s1' and level=50;
 perform public.rewards_sell_win(w24,u.id);perform public.rewards_claim_win(w50,u.id);
 if not exists(select 1 from public.rewards_orders where win_id=w50 and user_id=u.id) then raise exception 'season_order_missing';end if;
 if (select jsonb_agg(jsonb_build_object('id',id,'status',status) order by id) from public.rewards_prizes where name in('Наклейка | Бицепс','AWP | Экзотермия FT')) is distinct from status_before then raise exception 'catalog_status_changed';end if;
end $$;
rollback;
select 'PASSED: levels 21-24/50, 300 XP once, two shared inventory items, S1 unlocks, sale and order; all verification writes rolled back' verification;
