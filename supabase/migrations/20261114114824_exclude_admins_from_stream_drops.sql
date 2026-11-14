-- Chat stays available to admins. Their messages may advance stream activity,
-- but never create entries or tickets. Recheck role for previously recorded entries.

-- Primary chat activity and draw.
CREATE OR REPLACE FUNCTION public.rewards_record_chat_message(p_round_id uuid, p_twitch_user_id text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_eligible boolean := false;
  v_restricted boolean := false;
  v_banned boolean := false;
begin
  update public.rewards_rounds
     set message_count = message_count + 1
   where id = p_round_id and status = 'active';
  if not found then return; end if;
  if exists (select 1 from public.rewards_admins a where a.twitch_user_id=p_twitch_user_id) then return; end if;

  select id, steam_trade_url_valid, participation_restricted, banned
    into v_user_id, v_eligible, v_restricted, v_banned
    from public.rewards_users
   where twitch_user_id = p_twitch_user_id;

  if v_user_id is not null and not coalesce(v_banned,false) then
    insert into public.rewards_round_participants(round_id,user_id,message_count,first_message_at,last_message_at,eligible)
    values (p_round_id,v_user_id,1,now(),now(),coalesce(v_eligible,false) and not coalesce(v_restricted,false))
    on conflict (round_id,user_id) do update
      set message_count = public.rewards_round_participants.message_count + 1,
          last_message_at = now(),
          eligible = excluded.eligible;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rewards_finalize_round(p_round_id uuid)
 RETURNS TABLE(winner_user_id uuid, prize_id uuid, completion_reason text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
 -- Keep role changes from racing with selection and prize delivery.
 lock table public.rewards_admins in share mode;
 -- Snapshot eligible identities and integer ticket weights in one statement. Chat writes
 -- first lock this round, so no later message can change its draw while this lock is held.
 select array_agg(p.user_id order by p.user_id),array_agg(case when v_round.weight_by_messages then p.message_count else 1 end order by p.user_id),count(*)::integer,
 coalesce(sum(case when v_round.weight_by_messages then p.message_count::bigint else 1::bigint end),0),coalesce(sum(greatest(p.message_count,0)::bigint),0)
 into v_users,v_weights,v_count,v_total,v_messages
 from public.rewards_round_participants p join public.rewards_users u on u.id=p.user_id
 where p.round_id=p_round_id and p.eligible=true and coalesce(u.steam_trade_url_valid,false) and not coalesce(u.banned,false) and not coalesce(u.participation_restricted,false) and not exists (select 1 from public.rewards_admins a where a.twitch_user_id=u.twitch_user_id)
   and (not v_round.weight_by_messages or p.message_count>0);
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
end$function$;

-- Partner streamer drops.
CREATE OR REPLACE FUNCTION public.rewards_streamer_live_chat(p_broadcaster text, p_message text, p_user text, p_occurred timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.rewards_streamer_live_profiles;r public.rewards_streamer_live_rounds;u public.rewards_users;
begin
 perform 1 from public.rewards_streamer_live_control where id=true and enabled for share;if not found then return;end if;
 select * into s from public.rewards_streamer_live_profiles where broadcaster_id=p_broadcaster and status='approved' for update;if not found then return;end if;
 if length(coalesce(p_message,'')) not between 1 and 256 or p_user !~ '^[0-9]{1,30}$' or p_occurred is null then raise exception 'invalid_event';end if;
 perform public.rewards_streamer_live_expire(p_broadcaster);
 insert into public.rewards_streamer_live_events(broadcaster_id,message_id) values(p_broadcaster,p_message) on conflict do nothing;if not found then return;end if;
 select * into r from public.rewards_streamer_live_rounds where broadcaster_id=p_broadcaster and status='active' for update;
 if not found or p_user=p_broadcaster or p_occurred<r.started_at or p_occurred>clock_timestamp()+interval '1 minute' then return;end if;
 select * into u from public.rewards_users where twitch_user_id=p_user and not banned
  and not exists (select 1 from public.rewards_admins a where a.twitch_user_id=p_user);
 if found then insert into public.rewards_streamer_live_participants(round_id,user_id) values(r.id,u.id) on conflict do nothing;end if;
 update public.rewards_streamer_live_rounds set message_count=message_count+1 where id=r.id;
 if r.mode='messages' and r.message_count+1>=r.threshold then perform public.rewards_streamer_live_finish(r.id);end if;
end $function$;

CREATE OR REPLACE FUNCTION public.rewards_streamer_live_finish(p_round uuid, p_cancel boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.rewards_streamer_live_rounds; w public.rewards_users; n integer;
begin
 select * into r from public.rewards_streamer_live_rounds where id=p_round for update;
 if not found or r.status<>'active' then return;end if;
 if not p_cancel then
  -- Keep role changes from racing with selection and prize delivery.
  lock table public.rewards_admins in share mode;
  select count(*) into n from public.rewards_streamer_live_participants p join public.rewards_users u on u.id=p.user_id where p.round_id=r.id and not u.banned and not u.participation_restricted and u.steam_trade_url_valid
   and not exists (select 1 from public.rewards_admins a where a.twitch_user_id=u.twitch_user_id);
  if n>0 then select u.* into w from public.rewards_streamer_live_participants p join public.rewards_users u on u.id=p.user_id where p.round_id=r.id and not u.banned and not u.participation_restricted and u.steam_trade_url_valid
   and not exists (select 1 from public.rewards_admins a where a.twitch_user_id=u.twitch_user_id) order by u.id offset public.rewards_crypto_index(n) limit 1;end if;
 end if;
 if w.id is null then insert into public.rewards_streamer_live_ledger(broadcaster_id,amount,kind,request_id,actor) values(r.broadcaster_id,r.cost,'refund',r.id,'system') on conflict do nothing;
 else perform public.rewards_streamer_live_deliver(r.broadcaster_id,w.id,r.prize_id,r.prize_name,r.cost,r.id,null);end if;
 update public.rewards_streamer_live_rounds set status=case when p_cancel then 'cancelled' else 'completed' end,finished_at=clock_timestamp(),winner=w.id,winner_name=w.twitch_display_name where id=r.id;
end $function$;

-- Streamer test drops use the same eligibility rule.
CREATE OR REPLACE FUNCTION public.rewards_pilot_chat(p_broadcaster text, p_message text, p_user text, p_occurred timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.rewards_pilot_profiles;r public.rewards_pilot_rounds;u public.rewards_users;
begin
 perform 1 from public.rewards_pilot_control where id=true and enabled for share;if not found then return;end if;
 select * into s from public.rewards_pilot_profiles where broadcaster_id=p_broadcaster and status='approved' for update;if not found then return;end if;
 if length(coalesce(p_message,'')) not between 1 and 256 or p_user !~ '^[0-9]{1,30}$' or p_occurred is null then raise exception 'invalid_event';end if;
 perform public.rewards_pilot_expire(p_broadcaster);
 insert into public.rewards_pilot_events(broadcaster_id,message_id) values(p_broadcaster,p_message) on conflict do nothing;if not found then return;end if;
 select * into r from public.rewards_pilot_rounds where broadcaster_id=p_broadcaster and status='active' for update;
 if not found or p_user=p_broadcaster or p_occurred<r.started_at or p_occurred>clock_timestamp()+interval '1 minute' then return;end if;
 select * into u from public.rewards_users where twitch_user_id=p_user and not banned
  and not exists (select 1 from public.rewards_admins a where a.twitch_user_id=p_user);
 if found then insert into public.rewards_pilot_participants(round_id,user_id) values(r.id,u.id) on conflict do nothing;end if;
 update public.rewards_pilot_rounds set message_count=message_count+1 where id=r.id;
 if r.mode='messages' and r.message_count+1>=r.threshold then perform public.rewards_pilot_finish(r.id);end if;
end $function$;

CREATE OR REPLACE FUNCTION public.rewards_pilot_finish(p_round uuid, p_cancel boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.rewards_pilot_rounds; w public.rewards_users; n integer;
begin
 select * into r from public.rewards_pilot_rounds where id=p_round for update;
 if not found or r.status<>'active' then return;end if;
 if not p_cancel then
  -- Keep role changes from racing with selection and prize delivery.
  lock table public.rewards_admins in share mode;
  select count(*) into n from public.rewards_pilot_participants p join public.rewards_users u on u.id=p.user_id where p.round_id=r.id and not u.banned and not u.participation_restricted and u.steam_trade_url_valid
   and not exists (select 1 from public.rewards_admins a where a.twitch_user_id=u.twitch_user_id);
  if n>0 then select u.* into w from public.rewards_pilot_participants p join public.rewards_users u on u.id=p.user_id where p.round_id=r.id and not u.banned and not u.participation_restricted and u.steam_trade_url_valid
   and not exists (select 1 from public.rewards_admins a where a.twitch_user_id=u.twitch_user_id) order by u.id offset public.rewards_crypto_index(n) limit 1;end if;
 end if;
 if w.id is null then insert into public.rewards_pilot_ledger(broadcaster_id,amount,kind,request_id,actor) values(r.broadcaster_id,r.cost,'refund',r.id,'system') on conflict do nothing;
 else insert into public.rewards_pilot_awards(broadcaster_id,user_id,prize_name,cost,round_id) values(r.broadcaster_id,w.id,r.prize_name,r.cost,r.id);end if;
 update public.rewards_pilot_rounds set status=case when p_cancel then 'cancelled' else 'completed' end,finished_at=clock_timestamp(),winner=w.id,winner_name=w.twitch_display_name where id=r.id;
end $function$;

-- Dropso Connect chat activity and skin/coin drops.
CREATE OR REPLACE FUNCTION public.rewards_connect_chat_record(p_broadcaster text, p_user text, p_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare sid uuid;uid uuid;begin
 select s.id into sid from public.rewards_connect_sessions s join public.rewards_connect_settings c on c.broadcaster=s.broadcaster where s.broadcaster=p_broadcaster and s.ended_at is null and c.enabled and s.last_seen>now()-interval '60 seconds' and p_at>=s.started_at and p_at<=now()+interval '10 seconds';if sid is null then return;end if;
 select id into uid from public.rewards_users where twitch_user_id=p_user and not banned and not participation_restricted
  and not exists (select 1 from public.rewards_admins a where a.twitch_user_id=p_user);
 if uid is null then return;end if;
 insert into public.rewards_connect_chat values(sid,uid,p_at) on conflict(session_id,user_id) do update set last_at=greatest(public.rewards_connect_chat.last_at,excluded.last_at);
end $function$;

CREATE OR REPLACE FUNCTION public.rewards_connect_ingest(p_hash text, p_action text, p_body jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.rewards_connect_settings;s public.rewards_connect_sessions;prev jsonb;cfg jsonb;rule jsonb;kind text;threshold int;earned int:=0;victory int:=0;n int;w public.rewards_users;pr public.rewards_prizes;wid uuid;cid uuid;cost int;label text;since_at timestamptz;last_at timestamptz;stamp timestamptz;result_status text;state jsonb;crossed boolean;
begin
 select * into c from public.rewards_connect_settings where key_hash=p_hash and key_expires>now() for update;
 if not found or not exists(select 1 from public.rewards_streamers where is_primary and enabled and twitch_broadcaster_id=c.broadcaster) then raise exception 'invalid_key';end if;
 if p_action='start' then
  if coalesce(p_body->>'version','')<>'1.0.1' then raise exception 'invalid_client_version';end if;
  update public.rewards_connect_sessions set ended_at=now() where broadcaster=c.broadcaster and ended_at is null;
  insert into public.rewards_connect_sessions(broadcaster) values(c.broadcaster) returning * into s;return jsonb_build_object('session',s.id);
 end if;
 select * into s from public.rewards_connect_sessions where id=(p_body->>'session')::uuid and broadcaster=c.broadcaster and ended_at is null for update;
 if not found then raise exception 'session_closed';end if;
 if p_action='stop' then update public.rewards_connect_sessions set ended_at=now() where id=s.id;return jsonb_build_object('ok',true);end if;
 if p_action<>'snapshot' then raise exception 'invalid_action';end if;
 if (p_body->>'seq')::int<=s.seq then return jsonb_build_object('ok',true,'duplicate',true);end if;
 stamp:=to_timestamp((p_body->>'at')::bigint);if abs(extract(epoch from(now()-stamp)))>30 then raise exception 'stale_snapshot';end if;
 prev:=s.snapshot;cfg:=c.config;state:=coalesce(s.event_state,'{}'::jsonb);
 -- Pin the session to the first observed local SteamID, including during invalid/spectator states.
 if prev is not null and prev->>'steamId'<>p_body->>'steamId' then return jsonb_build_object('ok',true,'ignored','different_player');end if;
 if (p_body->>'live')::boolean and coalesce((prev->>'live')::boolean,false) and prev->>'team'=p_body->>'team' and cfg->'modes' ? (p_body->>'mode') and prev is not null and prev->>'steamId'=p_body->>'steamId' and prev->>'map'=p_body->>'map' and prev->>'mode'=p_body->>'mode' and (p_body->>'round')::int>=(prev->>'round')::int and stamp>=to_timestamp((prev->>'at')::bigint) then
  earned:=case when prev->>'round'=p_body->>'round' then (p_body->>'kills')::int-(prev->>'kills')::int else (p_body->>'kills')::int end;if earned<0 or earned>10 then earned:=0;end if;
  if prev->>'phase'<>'over' and p_body->>'phase'='over' and prev->>'round'=p_body->>'round' and prev->>'team'=p_body->>'team' and p_body->>'team'=p_body->>'winner' then victory:=1;end if;
 end if;
 update public.rewards_connect_sessions set seq=(p_body->>'seq')::int,snapshot=p_body,last_seen=now(),kills=kills+earned,wins=wins+victory where id=s.id returning * into s;
 if not (p_body->>'live')::boolean or not c.enabled or not cfg->'modes' ? (p_body->>'mode') then return jsonb_build_object('ok',true,'kills',s.kills,'wins',s.wins,'awards',s.awards);end if;
 foreach kind in array array['kill1','kill2','kill3','kill4','ace','win'] loop
  if kind='win' then crossed:=victory=1;else
   threshold:=case kind when 'kill1' then 1 when 'kill2' then 2 when 'kill3' then 3 when 'kill4' then 4 else 5 end;
   crossed:=earned>0 and (p_body->>'kills')::int>=threshold and (prev is null or prev->>'round'<>p_body->>'round' or prev->>'map'<>p_body->>'map' or (prev->>'kills')::int<threshold);
  end if;
  if not crossed then continue;end if;
  rule:=cfg->'events'->kind;if not coalesce((rule->>'enabled')::boolean,false) then continue;end if;
  since_at:=coalesce((state->kind->>'since')::timestamptz,s.started_at);last_at:=(state->kind->>'last')::timestamptz;
  result_status:='awarded';wid:=null;cid:=null;cost:=0;label:=null;w:=null;pr:=null;
  if last_at is not null and now()<last_at+(cfg->>'cooldown')::int*interval '1 second' then result_status:='cooldown';end if;
  if s.awards>=(cfg->>'maxAwards')::int or s.spent>=(cfg->>'budget')::int then result_status:='limit_reached';end if;
  if result_status='awarded' then
   -- Keep role changes from racing with selection and prize delivery.
   lock table public.rewards_admins in share mode;
   select count(*) into n from public.rewards_connect_chat ch join public.rewards_users u on u.id=ch.user_id where ch.session_id=s.id and ch.last_at>=greatest(since_at,now()-(cfg->>'lookback')::int*interval '1 second') and ch.last_at<=now() and not u.banned and not u.participation_restricted
     and not exists (select 1 from public.rewards_admins a where a.twitch_user_id=u.twitch_user_id)
     and (not (cfg->>'tradeRequired')::boolean or u.steam_trade_url_valid) and (not (cfg->>'excludePrevious')::boolean or u.id is distinct from s.previous_winner);
   if n<(cfg->>'minViewers')::int then result_status:='no_participants';else
    select u.* into w from public.rewards_connect_chat ch join public.rewards_users u on u.id=ch.user_id where ch.session_id=s.id and ch.last_at>=greatest(since_at,now()-(cfg->>'lookback')::int*interval '1 second') and ch.last_at<=now() and not u.banned and not u.participation_restricted
     and not exists (select 1 from public.rewards_admins a where a.twitch_user_id=u.twitch_user_id)
     and (not (cfg->>'tradeRequired')::boolean or u.steam_trade_url_valid) and (not (cfg->>'excludePrevious')::boolean or u.id is distinct from s.previous_winner) order by u.id offset public.rewards_crypto_index(n) limit 1;
    if rule->>'type'='coins' then cost:=(rule->>'coinMin')::int+public.rewards_crypto_index((rule->>'coinMax')::int-(rule->>'coinMin')::int+1);label:=cost||' монет';else
     select * into pr from public.rewards_prizes where status='available' and sell_price_coins between (rule->>'min')::int and least((rule->>'max')::int,(cfg->>'budget')::int-s.spent) order by id offset public.rewards_crypto_index(greatest(1,(select count(*)::int from public.rewards_prizes where status='available' and sell_price_coins between (rule->>'min')::int and least((rule->>'max')::int,(cfg->>'budget')::int-s.spent)))) limit 1;
     if not found then result_status:='no_prize';else cost:=pr.sell_price_coins;label:=pr.name;end if;
    end if;
    if s.spent+cost>(cfg->>'budget')::int then result_status:='limit_reached';end if;
   end if;
  end if;
  if result_status='awarded' then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(w.id::text,0));
   if rule->>'type'='coins' then insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(w.id,cost,'adjustment','Dropso Connect · '||kind||' · '||s.id) returning id into cid;
   else insert into public.rewards_wins(user_id,prize_id,source_type,delivery_status,choice_status) values(w.id,pr.id,'streamer','awaiting_choice','awaiting_choice') returning id into wid;end if;
   update public.rewards_connect_sessions set awards=awards+1,spent=spent+cost,previous_winner=w.id where id=s.id returning * into s;
  end if;
  if result_status<>'cooldown' then state:=jsonb_set(state,array[kind],jsonb_build_object('since',now(),'last',now()),true);update public.rewards_connect_sessions set event_state=state where id=s.id;end if;
  insert into public.rewards_connect_awards(session_id,seq,kind,status,winner,winner_name,prize_name,cost,win_id,coin_id) values(s.id,s.seq,kind,result_status,case when result_status='awarded' then w.id end,case when result_status='awarded' then w.twitch_display_name end,label,case when result_status='awarded' then cost else 0 end,wid,cid);
 end loop;
 select * into s from public.rewards_connect_sessions where id=s.id;
 return jsonb_build_object('ok',true,'kills',s.kills,'wins',s.wins,'awards',s.awards);
end $function$;
