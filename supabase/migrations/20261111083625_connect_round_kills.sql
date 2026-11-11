-- Round-local telemetry; retain existing settings, keys and award history.
create or replace function public.rewards_connect_ingest(p_hash text,p_action text,p_body jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.rewards_connect_settings;s public.rewards_connect_sessions;prev jsonb;cfg jsonb;rule jsonb;kind text;earned int:=0;victory int:=0;n int;w public.rewards_users;pr public.rewards_prizes;wid uuid;cid uuid;cost int;label text;since_at timestamptz;last_at timestamptz;progress int;stamp timestamptz;result_status text;begin
 select * into c from public.rewards_connect_settings where key_hash=p_hash and key_expires>now() for update;
 if not found or not exists(select 1 from public.rewards_streamers where is_primary and enabled and twitch_broadcaster_id=c.broadcaster) then raise exception 'invalid_key';end if;
 if p_action='start' then
  if coalesce(p_body->>'version','')<>'1.0.1' then raise exception 'invalid_client_version';end if;
  update public.rewards_connect_sessions set ended_at=now() where broadcaster=c.broadcaster and ended_at is null;
  insert into public.rewards_connect_sessions(broadcaster) values(c.broadcaster) returning * into s;
  return jsonb_build_object('session',s.id);
 end if;
 select * into s from public.rewards_connect_sessions where id=(p_body->>'session')::uuid and broadcaster=c.broadcaster and ended_at is null for update;if not found then raise exception 'session_closed';end if;
 if p_action='stop' then update public.rewards_connect_sessions set ended_at=now() where id=s.id;return jsonb_build_object('ok',true);end if;
 if p_action<>'snapshot' then raise exception 'invalid_action';end if;
 if (p_body->>'seq')::int<=s.seq then return jsonb_build_object('ok',true,'duplicate',true);end if;
 stamp:=to_timestamp((p_body->>'at')::bigint);if abs(extract(epoch from(now()-stamp)))>30 then raise exception 'stale_snapshot';end if;
 prev:=s.snapshot;cfg:=c.config;
 -- Pin the first observed SteamID for this session, including across maps and invalid states.
 if s.snapshot is not null and s.snapshot->>'steamId'<>p_body->>'steamId' then return jsonb_build_object('ok',true,'ignored','different_player');end if;
 if (p_body->>'live')::boolean and coalesce((prev->>'live')::boolean,false) and prev->>'team'=p_body->>'team' and cfg->'modes' ? (p_body->>'mode') and prev is not null and prev->>'steamId'=p_body->>'steamId' and prev->>'map'=p_body->>'map' and prev->>'mode'=p_body->>'mode' and (p_body->>'round')::int>=(prev->>'round')::int and stamp>=to_timestamp((prev->>'at')::bigint) then
  earned:=case when prev->>'round'=p_body->>'round' then (p_body->>'kills')::int-(prev->>'kills')::int else (p_body->>'kills')::int end;if earned<0 or earned>10 then earned:=0;end if;
  if prev->>'phase'<>'over' and p_body->>'phase'='over' and prev->>'round'=p_body->>'round' and prev->>'team'=p_body->>'team' and p_body->>'team'=p_body->>'winner' then victory:=1;end if;
 end if;
 update public.rewards_connect_sessions set seq=(p_body->>'seq')::int,snapshot=p_body,last_seen=now(),kills=kills+earned,wins=wins+victory,kill_progress=case when prev is not null and prev->>'round'=p_body->>'round' and prev->>'map'=p_body->>'map' and prev->>'mode'=p_body->>'mode' and prev->>'team'=p_body->>'team' and coalesce((prev->>'live')::boolean,false) and (p_body->>'live')::boolean then case when kill_progress<0 then -1 else kill_progress+earned end else earned end,win_progress=win_progress+victory where id=s.id returning * into s;
 if not (p_body->>'live')::boolean or not c.enabled or not cfg->'modes' ? (p_body->>'mode') then return jsonb_build_object('ok',true);end if;
 foreach kind in array array['kills','wins'] loop
  rule:=cfg->kind;progress:=case when kind='kills' then s.kill_progress else s.win_progress end;since_at:=case when kind='kills' then s.kill_since else s.win_since end;last_at:=case when kind='kills' then s.kill_last else s.win_last end;
  if not (rule->>'enabled')::boolean or progress<(rule->>'every')::int or last_at is not null and now()<last_at+(cfg->>'cooldown')::int*interval '1 second' then continue;end if;
  -- Kill threshold triggers once per round; -1 marks the consumed round. Wins retain their separate counter.
  if kind='kills' then update public.rewards_connect_sessions set kill_progress=-1,kill_since=now(),kill_last=now() where id=s.id;else update public.rewards_connect_sessions set win_progress=mod(win_progress,(rule->>'every')::int),win_since=now(),win_last=now() where id=s.id;end if;
  result_status:='awarded';wid:=null;cid:=null;cost:=0;label:=null;w:=null;pr:=null;
  if s.awards>=(cfg->>'maxAwards')::int or s.spent>=(cfg->>'budget')::int then result_status:='limit_reached';end if;
  if result_status='awarded' then
   select count(*) into n from public.rewards_connect_chat ch join public.rewards_users u on u.id=ch.user_id where ch.session_id=s.id and ch.last_at>=greatest(since_at,now()-(cfg->>'lookback')::int*interval '1 second') and ch.last_at<=now() and not u.banned and not u.participation_restricted and (not (cfg->>'tradeRequired')::boolean or u.steam_trade_url_valid) and (not (cfg->>'excludePrevious')::boolean or u.id is distinct from s.previous_winner);
   if n<(cfg->>'minViewers')::int then result_status:='no_participants';else
    select u.* into w from public.rewards_connect_chat ch join public.rewards_users u on u.id=ch.user_id where ch.session_id=s.id and ch.last_at>=greatest(since_at,now()-(cfg->>'lookback')::int*interval '1 second') and ch.last_at<=now() and not u.banned and not u.participation_restricted and (not (cfg->>'tradeRequired')::boolean or u.steam_trade_url_valid) and (not (cfg->>'excludePrevious')::boolean or u.id is distinct from s.previous_winner) order by u.id offset public.rewards_crypto_index(n) limit 1;
    if rule->>'type'='coins' then cost:=(rule->>'coins')::int;label:=cost||' монет';else
     select * into pr from public.rewards_prizes where status='available' and sell_price_coins between (rule->>'min')::int and least((rule->>'max')::int,(cfg->>'budget')::int-s.spent) order by id offset public.rewards_crypto_index(greatest(1,(select count(*)::int from public.rewards_prizes where status='available' and sell_price_coins between (rule->>'min')::int and least((rule->>'max')::int,(cfg->>'budget')::int-s.spent)))) limit 1;
     if not found then result_status:='no_prize';else cost:=pr.sell_price_coins;label:=pr.name;end if;
    end if;
    if s.spent+cost>(cfg->>'budget')::int then result_status:='limit_reached';end if;
   end if;
  end if;
  if result_status='awarded' then
   -- Same account/inventory and choice flow as site drops; ledger and result commit together.
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(w.id::text,0));
   if rule->>'type'='coins' then insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(w.id,cost,'adjustment','Dropso Connect · '||kind||' · '||s.id) returning id into cid;
   else insert into public.rewards_wins(user_id,prize_id,source_type,delivery_status,choice_status) values(w.id,pr.id,'streamer','awaiting_choice','awaiting_choice') returning id into wid;end if;
   update public.rewards_connect_sessions set awards=awards+1,spent=spent+cost,previous_winner=w.id where id=s.id returning * into s;
  end if;
  insert into public.rewards_connect_awards(session_id,seq,kind,status,winner,winner_name,prize_name,cost,win_id,coin_id) values(s.id,s.seq,kind,result_status,case when result_status='awarded' then w.id end,case when result_status='awarded' then w.twitch_display_name end,label,case when result_status='awarded' then cost else 0 end,wid,cid);
 end loop;
 return jsonb_build_object('ok',true,'kills',s.kills,'wins',s.wins,'awards',s.awards);
end $$;

-- Old desktop snapshots contained match totals. Close sessions before the new protocol is used.
update public.rewards_connect_sessions set ended_at=now() where ended_at is null;
