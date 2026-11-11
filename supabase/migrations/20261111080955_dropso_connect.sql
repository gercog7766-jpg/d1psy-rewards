-- CS2 telemetry and rewards are service-only. The desktop has a revocable, scoped key.
create table public.rewards_connect_settings(
 broadcaster text primary key, config jsonb not null default '{"kills":{"enabled":true,"every":5,"type":"coins","coins":5,"min":2,"max":20},"wins":{"enabled":false,"every":1,"type":"coins","coins":5,"min":2,"max":20},"modes":["competitive","casual","scrimcomp2v2"],"cooldown":15,"lookback":300,"minViewers":1,"maxAwards":100,"budget":1000,"tradeRequired":true,"excludePrevious":false}',
 key_hash text, key_expires timestamptz, enabled boolean not null default false,updated_at timestamptz not null default now()
);
create table public.rewards_connect_sessions(
 id uuid primary key default gen_random_uuid(),broadcaster text not null references public.rewards_connect_settings(broadcaster),started_at timestamptz not null default now(),last_seen timestamptz not null default now(),ended_at timestamptz,seq integer not null default 0,snapshot jsonb,
 kill_progress integer not null default 0,win_progress integer not null default 0,kills integer not null default 0,wins integer not null default 0,
 kill_since timestamptz not null default now(),win_since timestamptz not null default now(),kill_last timestamptz,win_last timestamptz,awards integer not null default 0,spent integer not null default 0,previous_winner uuid references public.rewards_users(id)
);
create unique index rewards_connect_one_session on public.rewards_connect_sessions(broadcaster) where ended_at is null;
create index rewards_connect_session_history on public.rewards_connect_sessions(broadcaster,started_at desc);
create table public.rewards_connect_chat(session_id uuid not null references public.rewards_connect_sessions(id),user_id uuid not null references public.rewards_users(id),last_at timestamptz not null,primary key(session_id,user_id));
create table public.rewards_connect_awards(id uuid primary key default gen_random_uuid(),session_id uuid not null references public.rewards_connect_sessions(id),seq integer not null,kind text not null check(kind in('kills','wins')),status text not null,winner uuid references public.rewards_users(id),winner_name text,prize_name text,cost integer not null default 0,win_id uuid references public.rewards_wins(id),coin_id uuid references public.rewards_coin_transactions(id),created_at timestamptz not null default now(),unique(session_id,seq,kind));
create index rewards_connect_awards_history on public.rewards_connect_awards(session_id,created_at desc);
create index rewards_connect_chat_user on public.rewards_connect_chat(user_id);
create index rewards_connect_awards_winner on public.rewards_connect_awards(winner);
create index rewards_connect_awards_win on public.rewards_connect_awards(win_id);
create index rewards_connect_awards_coin on public.rewards_connect_awards(coin_id);
alter table public.rewards_connect_settings enable row level security;
alter table public.rewards_connect_sessions enable row level security;
alter table public.rewards_connect_chat enable row level security;
alter table public.rewards_connect_awards enable row level security;
revoke all on public.rewards_connect_settings,public.rewards_connect_sessions,public.rewards_connect_chat,public.rewards_connect_awards from public,anon,authenticated;
grant select,insert,update,delete on public.rewards_connect_settings,public.rewards_connect_sessions,public.rewards_connect_chat,public.rewards_connect_awards to service_role;

create function public.rewards_connect_admin(p_actor text,p_action text,p_body jsonb default '{}'::jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cfg jsonb;rule jsonb;k text;s public.rewards_connect_sessions;begin
 if not exists(select 1 from public.rewards_streamers where is_primary and enabled and twitch_broadcaster_id=p_actor) then raise exception 'owner_required';end if;
 insert into public.rewards_connect_settings(broadcaster) values(p_actor) on conflict do nothing;
 perform 1 from public.rewards_connect_settings where broadcaster=p_actor for update;
 if p_action='configure' then
  cfg:=p_body->'config';
  if cfg is null or jsonb_typeof(cfg)<>'object' or (select count(*) from jsonb_object_keys(cfg))<>11 or not cfg ?& array['kills','wins','modes','cooldown','lookback','minViewers','maxAwards','budget','tradeRequired','excludePrevious','enabled'] then raise exception 'invalid_config';end if;
  for k in select unnest(array['kills','wins']) loop
   rule:=cfg->k;
   if jsonb_typeof(rule)<>'object' or (select count(*) from jsonb_object_keys(rule))<>6 or not rule ?& array['enabled','every','type','coins','min','max'] or jsonb_typeof(rule->'enabled')<>'boolean' or (rule->>'every')::int not between 1 and 100 or rule->>'type' not in('coins','skin') or (rule->>'coins')::int not between 1 and 3000 or (rule->>'min')::int not between 2 and 3000 or (rule->>'max')::int not between (rule->>'min')::int and 3000 then raise exception 'invalid_config';end if;
  end loop;
  if jsonb_typeof(cfg->'modes')<>'array' or jsonb_array_length(cfg->'modes') not between 1 and 5 or exists(select 1 from jsonb_array_elements_text(cfg->'modes') m where m not in('competitive','casual','scrimcomp2v2','deathmatch','gungameprogressive')) or (cfg->>'cooldown')::int not between 0 and 3600 or (cfg->>'lookback')::int not between 1 and 3600 or (cfg->>'minViewers')::int not between 1 and 1000 or (cfg->>'maxAwards')::int not between 1 and 1000 or (cfg->>'budget')::int not between 1 and 1000000 or jsonb_typeof(cfg->'tradeRequired')<>'boolean' or jsonb_typeof(cfg->'excludePrevious')<>'boolean' or jsonb_typeof(cfg->'enabled')<>'boolean' then raise exception 'invalid_config';end if;
  -- Reconfiguration starts a new observation period and cannot retroactively reward old kills.
  update public.rewards_connect_settings set config=cfg-'enabled',enabled=(cfg->>'enabled')::boolean,updated_at=now() where broadcaster=p_actor;
  update public.rewards_connect_sessions set snapshot=null,kill_progress=0,win_progress=0,kill_since=now(),win_since=now() where broadcaster=p_actor and ended_at is null;
 elsif p_action='key' then
  if coalesce(p_body->>'hash','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid_key';end if;
  update public.rewards_connect_sessions set ended_at=now() where broadcaster=p_actor and ended_at is null;
  update public.rewards_connect_settings set key_hash=p_body->>'hash',key_expires=now()+interval '24 hours' where broadcaster=p_actor;
 elsif p_action='stop' then
  update public.rewards_connect_sessions set ended_at=now() where broadcaster=p_actor and ended_at is null;
 elsif p_action='revoke' then
  update public.rewards_connect_sessions set ended_at=now() where broadcaster=p_actor and ended_at is null;
  update public.rewards_connect_settings set key_hash=null,key_expires=null where broadcaster=p_actor;
 elsif p_action<>'state' then raise exception 'invalid_action';end if;
 select * into s from public.rewards_connect_sessions where broadcaster=p_actor order by started_at desc limit 1;
 return jsonb_build_object('config',(select config||jsonb_build_object('enabled',enabled) from public.rewards_connect_settings where broadcaster=p_actor),'keyExpires',(select key_expires from public.rewards_connect_settings where broadcaster=p_actor),'session',to_jsonb(s),'history',coalesce((select jsonb_agg(x) from(select a.*,u.twitch_display_name as name from public.rewards_connect_awards a left join public.rewards_users u on u.id=a.winner where a.session_id=s.id order by a.created_at desc limit 30)x),'[]'::jsonb));
end $$;

create function public.rewards_connect_chat_record(p_broadcaster text,p_user text,p_at timestamptz) returns void language plpgsql security invoker set search_path='' as $$
declare sid uuid;uid uuid;begin
 select s.id into sid from public.rewards_connect_sessions s join public.rewards_connect_settings c on c.broadcaster=s.broadcaster where s.broadcaster=p_broadcaster and s.ended_at is null and c.enabled and s.last_seen>now()-interval '60 seconds' and p_at>=s.started_at and p_at<=now()+interval '10 seconds';if sid is null then return;end if;
 select id into uid from public.rewards_users where twitch_user_id=p_user and not banned and not participation_restricted;if uid is null then return;end if;
 insert into public.rewards_connect_chat values(sid,uid,p_at) on conflict(session_id,user_id) do update set last_at=greatest(public.rewards_connect_chat.last_at,excluded.last_at);
end $$;

create function public.rewards_connect_ingest(p_hash text,p_action text,p_body jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.rewards_connect_settings;s public.rewards_connect_sessions;prev jsonb;cfg jsonb;rule jsonb;kind text;earned int:=0;victory int:=0;n int;w public.rewards_users;pr public.rewards_prizes;wid uuid;cid uuid;cost int;label text;since_at timestamptz;last_at timestamptz;progress int;stamp timestamptz;result_status text;begin
 select * into c from public.rewards_connect_settings where key_hash=p_hash and key_expires>now() for update;
 if not found or not exists(select 1 from public.rewards_streamers where is_primary and enabled and twitch_broadcaster_id=c.broadcaster) then raise exception 'invalid_key';end if;
 if p_action='start' then
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
 if (p_body->>'live')::boolean and cfg->'modes' ? (p_body->>'mode') and prev is not null and prev->>'steamId'=p_body->>'steamId' and prev->>'map'=p_body->>'map' and prev->>'mode'=p_body->>'mode' and (p_body->>'round')::int>=(prev->>'round')::int and stamp>=to_timestamp((prev->>'at')::bigint) then
  earned:=(p_body->>'kills')::int-(prev->>'kills')::int;if earned<0 or earned>10 then earned:=0;end if;
  if prev->>'phase'<>'over' and p_body->>'phase'='over' and prev->>'round'=p_body->>'round' and prev->>'team'=p_body->>'team' and p_body->>'team'=p_body->>'winner' then victory:=1;end if;
 end if;
 update public.rewards_connect_sessions set seq=(p_body->>'seq')::int,snapshot=case when (p_body->>'live')::boolean then p_body else null end,last_seen=now(),kills=kills+earned,wins=wins+victory,kill_progress=kill_progress+earned,win_progress=win_progress+victory where id=s.id returning * into s;
 if not (p_body->>'live')::boolean or not c.enabled or not cfg->'modes' ? (p_body->>'mode') then return jsonb_build_object('ok',true);end if;
 foreach kind in array array['kills','wins'] loop
  rule:=cfg->kind;progress:=case when kind='kills' then s.kill_progress else s.win_progress end;since_at:=case when kind='kills' then s.kill_since else s.win_since end;last_at:=case when kind='kills' then s.kill_last else s.win_last end;
  if not (rule->>'enabled')::boolean or progress<(rule->>'every')::int or last_at is not null and now()<last_at+(cfg->>'cooldown')::int*interval '1 second' then continue;end if;
  -- One reward per rule/snapshot; carry a partial threshold, consume all completed thresholds.
  if kind='kills' then update public.rewards_connect_sessions set kill_progress=mod(kill_progress,(rule->>'every')::int),kill_since=now(),kill_last=now() where id=s.id;else update public.rewards_connect_sessions set win_progress=mod(win_progress,(rule->>'every')::int),win_since=now(),win_last=now() where id=s.id;end if;
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
revoke all on function public.rewards_connect_admin(text,text,jsonb),public.rewards_connect_ingest(text,text,jsonb),public.rewards_connect_chat_record(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.rewards_connect_admin(text,text,jsonb),public.rewards_connect_ingest(text,text,jsonb),public.rewards_connect_chat_record(text,text,timestamptz) to service_role;
