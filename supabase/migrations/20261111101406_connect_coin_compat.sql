-- Preserve the fixed coin field in state responses while older site assets may still be cached.
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
 return jsonb_build_object('config',(select (config||jsonb_build_object('enabled',enabled))||jsonb_build_object('events',(select jsonb_object_agg(e.key,e.value||jsonb_build_object('coins',e.value->'coinMin')) from jsonb_each(config->'events') e(key,value))) from public.rewards_connect_settings where broadcaster=p_actor),'keyExpires',(select key_expires from public.rewards_connect_settings where broadcaster=p_actor),'session',to_jsonb(s),'history',coalesce((select jsonb_agg(x) from(select a.*,u.twitch_display_name as name from public.rewards_connect_awards a left join public.rewards_users u on u.id=a.winner where a.session_id=s.id order by a.created_at desc limit 30)x),'[]'::jsonb));
end $$;
