-- A primary owner's giveaway opt-out must not block earned Battle Pass rewards.
-- Keep bans, all other moderation restrictions, level thresholds and replay protection.
do $$
declare definition text;old_guard text:=$old$if not exists(select 1 from public.rewards_users where id=p_user_id and not banned and not participation_restricted)$old$;
new_guard text:=$new$if not exists(select 1 from public.rewards_users u where u.id=p_user_id and not u.banned and (not u.participation_restricted or exists(select 1 from public.rewards_streamers s where s.is_primary and s.twitch_broadcaster_id=u.twitch_user_id)))$new$;
begin
 select pg_get_functiondef('public.rewards_claim_season_reward(uuid,text,integer)'::regprocedure) into definition;
 if position(old_guard in definition)=0 then raise exception 'unexpected_season_reward_guard';end if;
 execute replace(definition,old_guard,new_guard);
end $$;
notify pgrst,'reload schema';
