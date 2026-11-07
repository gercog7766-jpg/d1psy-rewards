-- Reproduce the actual owner's giveaway opt-out, without retaining reward writes.
begin;
set local role service_role;
do $$
declare owner_row public.rewards_users;r jsonb;lv integer;original_flags integer[];
begin
 select u.* into owner_row from public.rewards_users u join public.rewards_streamers s on s.twitch_broadcaster_id=u.twitch_user_id where s.is_primary and not u.banned limit 1;
 if owner_row.id is null then raise exception 'owner_not_found';end if;
 select claimed_levels into original_flags from public.rewards_season_progress where user_id=owner_row.id and season_id='s1';
 foreach lv in array array[21,22,23,24,50] loop
  r:=public.rewards_claim_season_reward(owner_row.id,'s1',lv);
  if lv=any(original_flags) then
   if r->>'error'<>'already_claimed' then raise exception 'duplicate_guard_failed %',lv;end if;
  elsif r->>'ok'<>'true' then raise exception 'owner_claim_failed % %',lv,r;end if;
 end loop;
 if (select participation_restricted from public.rewards_users where id=owner_row.id) is distinct from owner_row.participation_restricted then raise exception 'giveaway_opt_out_changed';end if;
end $$;
rollback;
select 'PASSED: all five earned owner rewards, existing claim protection, giveaway opt-out unchanged; verification writes rolled back' verification;
