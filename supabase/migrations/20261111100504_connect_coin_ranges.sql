-- Keep both reward ranges per event. Coins are picked uniformly inside coinMin..coinMax.
update public.rewards_connect_settings c
set config=jsonb_set(c.config,'{events}',(
  select jsonb_object_agg(e.key,(e.value-'coins')||jsonb_build_object(
    'coinMin',coalesce(e.value->'coinMin',e.value->'coins','5'::jsonb),
    'coinMax',coalesce(e.value->'coinMax',e.value->'coins','5'::jsonb)
  ))
  from jsonb_each(c.config->'events') e(key,value)
),false)
where jsonb_typeof(c.config->'events')='object';

alter table public.rewards_connect_settings alter column config set default '{"events":{"kill1":{"enabled":false,"type":"coins","coinMin":5,"coinMax":5,"min":2,"max":20},"kill2":{"enabled":false,"type":"coins","coinMin":5,"coinMax":5,"min":2,"max":20},"kill3":{"enabled":false,"type":"coins","coinMin":5,"coinMax":5,"min":2,"max":20},"kill4":{"enabled":false,"type":"coins","coinMin":5,"coinMax":5,"min":2,"max":20},"ace":{"enabled":false,"type":"coins","coinMin":5,"coinMax":5,"min":2,"max":20},"win":{"enabled":false,"type":"coins","coinMin":5,"coinMax":5,"min":2,"max":20}},"modes":["competitive","casual","scrimcomp2v2"],"cooldown":15,"lookback":300,"minViewers":1,"maxAwards":100,"budget":1000,"tradeRequired":true,"excludePrevious":false}'::jsonb;

create or replace function public.rewards_connect_admin(p_actor text,p_action text,p_body jsonb default '{}'::jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cfg jsonb;rule jsonb;k text;s public.rewards_connect_sessions;begin
 if not exists(select 1 from public.rewards_streamers where is_primary and enabled and twitch_broadcaster_id=p_actor) then raise exception 'owner_required';end if;
 insert into public.rewards_connect_settings(broadcaster) values(p_actor) on conflict do nothing;
 perform 1 from public.rewards_connect_settings where broadcaster=p_actor for update;
 if p_action='configure' then
  cfg:=p_body->'config';
  if cfg is null or jsonb_typeof(cfg)<>'object' or (select count(*) from jsonb_object_keys(cfg))<>10 or not cfg ?& array['events','modes','cooldown','lookback','minViewers','maxAwards','budget','tradeRequired','excludePrevious','enabled'] or jsonb_typeof(cfg->'events')<>'object' or (select count(*) from jsonb_object_keys(cfg->'events'))<>6 or not (cfg->'events') ?& array['kill1','kill2','kill3','kill4','ace','win'] then raise exception 'invalid_config';end if;
  for k in select unnest(array['kill1','kill2','kill3','kill4','ace','win']) loop
   rule:=cfg->'events'->k;
   if jsonb_typeof(rule)<>'object' or jsonb_typeof(rule->'enabled')<>'boolean' or rule->>'type' not in('coins','skin') then raise exception 'invalid_config';end if;
   if (select count(*) from jsonb_object_keys(rule))=5 and rule ?& array['enabled','type','coins','min','max'] then
    if (rule->>'coins')::int not between 1 and 3000 or (rule->>'min')::int not between 2 and 3000 or (rule->>'max')::int not between (rule->>'min')::int and 3000 then raise exception 'invalid_config';end if;
    rule:=(rule-'coins')||jsonb_build_object('coinMin',(rule->>'coins')::int,'coinMax',(rule->>'coins')::int);
    cfg:=jsonb_set(cfg,array['events',k],rule,true);
   elsif (select count(*) from jsonb_object_keys(rule))=6 and rule ?& array['enabled','type','coinMin','coinMax','min','max'] then
    if jsonb_typeof(rule->'coinMin')<>'number' or jsonb_typeof(rule->'coinMax')<>'number' or (rule->>'coinMin')::int not between 1 and 3000 or (rule->>'coinMax')::int not between (rule->>'coinMin')::int and 3000 or (rule->>'min')::int not between 2 and 3000 or (rule->>'max')::int not between (rule->>'min')::int and 3000 then raise exception 'invalid_config';end if;
   else raise exception 'invalid_config';end if;
  end loop;
  if jsonb_typeof(cfg->'modes')<>'array' or jsonb_array_length(cfg->'modes') not between 1 and 5 or exists(select 1 from jsonb_array_elements_text(cfg->'modes') m where m not in('competitive','casual','scrimcomp2v2','deathmatch','gungameprogressive')) or (cfg->>'cooldown')::int not between 0 and 3600 or (cfg->>'lookback')::int not between 1 and 3600 or (cfg->>'minViewers')::int not between 1 and 1000 or (cfg->>'maxAwards')::int not between 1 and 1000 or (cfg->>'budget')::int not between 1 and 1000000 or jsonb_typeof(cfg->'tradeRequired')<>'boolean' or jsonb_typeof(cfg->'excludePrevious')<>'boolean' or jsonb_typeof(cfg->'enabled')<>'boolean' then raise exception 'invalid_config';end if;
  update public.rewards_connect_settings set config=cfg-'enabled',enabled=(cfg->>'enabled')::boolean,updated_at=now() where broadcaster=p_actor;
  update public.rewards_connect_sessions set snapshot=null,kill_progress=0,win_progress=0,kill_since=now(),win_since=now(),event_state='{}'::jsonb where broadcaster=p_actor and ended_at is null;
 elsif p_action='key' then
  if coalesce(p_body->>'hash','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid_key';end if;
  update public.rewards_connect_sessions set ended_at=now() where broadcaster=p_actor and ended_at is null;
  update public.rewards_connect_settings set key_hash=p_body->>'hash',key_expires=now()+interval '24 hours' where broadcaster=p_actor;
 elsif p_action='stop' then update public.rewards_connect_sessions set ended_at=now() where broadcaster=p_actor and ended_at is null;
 elsif p_action='revoke' then update public.rewards_connect_sessions set ended_at=now() where broadcaster=p_actor and ended_at is null;update public.rewards_connect_settings set key_hash=null,key_expires=null where broadcaster=p_actor;
 elsif p_action<>'state' then raise exception 'invalid_action';end if;
 select * into s from public.rewards_connect_sessions where broadcaster=p_actor order by started_at desc limit 1;
 return jsonb_build_object('config',(select config||jsonb_build_object('enabled',enabled) from public.rewards_connect_settings where broadcaster=p_actor),'keyExpires',(select key_expires from public.rewards_connect_settings where broadcaster=p_actor),'session',to_jsonb(s),'history',coalesce((select jsonb_agg(x) from(select a.*,u.twitch_display_name as name from public.rewards_connect_awards a left join public.rewards_users u on u.id=a.winner where a.session_id=s.id order by a.created_at desc limit 30)x),'[]'::jsonb));
end $$;

create or replace function public.rewards_connect_ingest(p_hash text,p_action text,p_body jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
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
   select count(*) into n from public.rewards_connect_chat ch join public.rewards_users u on u.id=ch.user_id where ch.session_id=s.id and ch.last_at>=greatest(since_at,now()-(cfg->>'lookback')::int*interval '1 second') and ch.last_at<=now() and not u.banned and not u.participation_restricted and (not (cfg->>'tradeRequired')::boolean or u.steam_trade_url_valid) and (not (cfg->>'excludePrevious')::boolean or u.id is distinct from s.previous_winner);
   if n<(cfg->>'minViewers')::int then result_status:='no_participants';else
    select u.* into w from public.rewards_connect_chat ch join public.rewards_users u on u.id=ch.user_id where ch.session_id=s.id and ch.last_at>=greatest(since_at,now()-(cfg->>'lookback')::int*interval '1 second') and ch.last_at<=now() and not u.banned and not u.participation_restricted and (not (cfg->>'tradeRequired')::boolean or u.steam_trade_url_valid) and (not (cfg->>'excludePrevious')::boolean or u.id is distinct from s.previous_winner) order by u.id offset public.rewards_crypto_index(n) limit 1;
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
end $$;
