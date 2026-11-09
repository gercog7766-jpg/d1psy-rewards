-- Opt-in selection for primary giveaways; legacy and partner rounds stay uniform by default.
alter table public.rewards_settings add column weight_by_messages boolean not null default false;
alter table public.rewards_rounds add column weight_by_messages boolean not null default false;
-- Missing values are resolved before NOT NULL checks, including automatic/older engine inserts.
alter table public.rewards_rounds alter column weight_by_messages drop default;
create function public.rewards_round_selection_snapshot() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.weight_by_messages is null then
   if new.streamer_id is null then select s.weight_by_messages into new.weight_by_messages from public.rewards_settings s where s.id=true;end if;
   new.weight_by_messages:=coalesce(new.weight_by_messages,false);
  end if;
 elsif new.weight_by_messages is distinct from old.weight_by_messages then raise exception 'round_selection_locked';
 end if;
 return new;
end$$;
revoke all on function public.rewards_round_selection_snapshot() from public,anon,authenticated;
grant execute on function public.rewards_round_selection_snapshot() to service_role;
create trigger rewards_round_selection_snapshot before insert or update of weight_by_messages on public.rewards_rounds for each row execute function public.rewards_round_selection_snapshot();
create or replace function public.rewards_finalize_round(p_round_id uuid)
returns table(winner_user_id uuid,prize_id uuid,completion_reason text)
language plpgsql security invoker set search_path='' as $$
declare v_round public.rewards_rounds%rowtype;v_prize public.rewards_prizes%rowtype;v_winner uuid;v_users uuid[];v_weights integer[];v_count integer;v_total bigint;v_messages bigint;v_ticket integer;v_cursor bigint:=0;v_winner_weight integer;v_winner_messages integer;i integer;
begin
 select * into v_round from public.rewards_rounds where id=p_round_id for update;
 if not found or v_round.status<>'active' then raise exception 'round_not_active';end if;
 if v_round.prize_id is null then raise exception 'round_prize_not_selected';end if;
 select * into v_prize from public.rewards_prizes where id=v_round.prize_id for update;
 if not found or v_prize.status<>'available' then raise exception 'prize_not_available';end if;
 if v_round.streamer_id is null then
  if not exists(select 1 from public.rewards_settings where id=true and twitch_connection_status='connected') then raise exception 'twitch_not_connected';end if;
 else
  if not exists(select 1 from public.rewards_streamer_settings where streamer_id=v_round.streamer_id and enabled=true and twitch_connection_status='connected') then raise exception 'twitch_not_connected';end if;
 end if;
 -- Snapshot eligible identities and integer ticket weights in one statement. Chat writes
 -- first lock this round, so no later message can change its draw while this lock is held.
 select array_agg(p.user_id order by p.user_id),array_agg(case when v_round.weight_by_messages then p.message_count else 1 end order by p.user_id),count(*)::integer,
 coalesce(sum(case when v_round.weight_by_messages then p.message_count::bigint else 1::bigint end),0),coalesce(sum(greatest(p.message_count,0)::bigint),0)
 into v_users,v_weights,v_count,v_total,v_messages
 from public.rewards_round_participants p join public.rewards_users u on u.id=p.user_id
 where p.round_id=p_round_id and p.eligible=true and coalesce(u.steam_trade_url_valid,false) and not coalesce(u.banned,false) and not coalesce(u.participation_restricted,false) and (not v_round.weight_by_messages or p.message_count>0);
 if v_count=0 then
  update public.rewards_rounds set status='completed',ended_at=now(),completion_reason='no_eligible_participants' where id=p_round_id;
  return query select null::uuid,v_prize.id,'no_eligible_participants'::text;return;
 end if;
 -- A round's message counter is an int32, and participant counts cannot exceed it.
 if v_total<1 or v_total>2147483647 then raise exception 'invalid_ticket_total';end if;
 v_ticket:=public.rewards_crypto_index(v_total::integer);
 for i in 1..v_count loop
  v_cursor:=v_cursor+v_weights[i];
  if v_ticket<v_cursor then v_winner:=v_users[i];v_winner_weight:=v_weights[i];exit;end if;
 end loop;
 if v_winner is null then raise exception 'winner_selection_failed';end if;
 -- If eligibility changed during the draw, retry the whole transaction rather than
 -- award a banned/restricted user. Lock only the winner to avoid multi-user lock cycles.
 perform 1 from public.rewards_users where id=v_winner and coalesce(steam_trade_url_valid,false) and not coalesce(banned,false) and not coalesce(participation_restricted,false) for update;
 if not found then raise exception 'winner_no_longer_eligible';end if;
 select message_count into v_winner_messages from public.rewards_round_participants where round_id=p_round_id and user_id=v_winner;
 insert into public.rewards_wins(round_id,user_id,prize_id) values(p_round_id,v_winner,v_prize.id);
 if not v_prize.unlimited then update public.rewards_prizes set status='assigned',updated_at=now() where id=v_prize.id;end if;
 update public.rewards_rounds set status='completed',ended_at=now(),completion_reason='winner_selected',winner_user_id=v_winner where id=p_round_id;
 insert into public.rewards_audit_log(action,entity_type,entity_id,details) values('round_finalized','rewards_rounds',p_round_id::text,jsonb_build_object('winner_user_id',v_winner,'prize_id',v_prize.id,'prize_unlimited',v_prize.unlimited,'rng','pgcrypto_rejection_sampling','streamer_id',v_round.streamer_id,'weight_by_messages',v_round.weight_by_messages,'eligible_participants',v_count,'eligible_messages',v_messages,'total_weight',v_total,'winner_weight',v_winner_weight,'winner_messages',v_winner_messages));
 return query select v_winner,v_prize.id,'winner_selected'::text;
end$$;
-- Keep winner selection private even on databases with different default privileges.
revoke all on function public.rewards_finalize_round(uuid) from public,anon,authenticated;
grant execute on function public.rewards_finalize_round(uuid) to service_role;
