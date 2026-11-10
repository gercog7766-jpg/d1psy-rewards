-- Allow restricted spectators (including the founder) to see the puzzle, while
-- keeping paid participation restrictions enforced by the original command.
alter function public.rewards_guess_word(text,text,jsonb) rename to rewards_guess_word_command;
create function public.rewards_guess_word(p_actor text,p_action text,p_body jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare viewer public.rewards_users; target uuid;
begin
 if jsonb_typeof(p_body) is distinct from 'object' then raise exception 'invalid_request';end if;
 if p_action='state' then
  select * into viewer from public.rewards_users where twitch_user_id=p_actor and not banned;
  if not found then raise exception 'user_unavailable';end if;
  select id into target from public.rewards_guess_rounds order by created_at desc,id desc limit 1;
  return public.rewards_guess_state(target,viewer.id)||jsonb_build_object('canPlay',not viewer.participation_restricted);
 end if;
 return public.rewards_guess_word_command(p_actor,p_action,p_body);
end $$;
revoke all on function public.rewards_guess_word(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_guess_word(text,text,jsonb) to service_role;
