-- Keep first-owner initialization on the six-event schema, not the legacy kills/wins shape.
alter table public.rewards_connect_settings alter column config set default '{
  "events": {
    "kill1": {"enabled": false, "type": "coins", "coins": 5, "min": 2, "max": 20},
    "kill2": {"enabled": false, "type": "coins", "coins": 5, "min": 2, "max": 20},
    "kill3": {"enabled": false, "type": "coins", "coins": 5, "min": 2, "max": 20},
    "kill4": {"enabled": false, "type": "coins", "coins": 5, "min": 2, "max": 20},
    "ace": {"enabled": false, "type": "coins", "coins": 5, "min": 2, "max": 20},
    "win": {"enabled": false, "type": "coins", "coins": 5, "min": 2, "max": 20}
  },
  "modes": ["competitive", "casual", "scrimcomp2v2"],
  "cooldown": 15,
  "lookback": 300,
  "minViewers": 1,
  "maxAwards": 100,
  "budget": 1000,
  "tradeRequired": true,
  "excludePrevious": false
}'::jsonb;

-- The admin page's first read may already have created a row from the old column default.
-- Preserve intentionally customized legacy rules, but keep an untouched disabled default inactive.
update public.rewards_connect_settings c
set config = case
  when not c.enabled
   and c.config = '{"kills":{"enabled":true,"every":5,"type":"coins","coins":5,"min":2,"max":20},"wins":{"enabled":false,"every":1,"type":"coins","coins":5,"min":2,"max":20},"modes":["competitive","casual","scrimcomp2v2"],"cooldown":15,"lookback":300,"minViewers":1,"maxAwards":100,"budget":1000,"tradeRequired":true,"excludePrevious":false}'::jsonb
  then '{"events":{"kill1":{"enabled":false,"type":"coins","coins":5,"min":2,"max":20},"kill2":{"enabled":false,"type":"coins","coins":5,"min":2,"max":20},"kill3":{"enabled":false,"type":"coins","coins":5,"min":2,"max":20},"kill4":{"enabled":false,"type":"coins","coins":5,"min":2,"max":20},"ace":{"enabled":false,"type":"coins","coins":5,"min":2,"max":20},"win":{"enabled":false,"type":"coins","coins":5,"min":2,"max":20}},"modes":["competitive","casual","scrimcomp2v2"],"cooldown":15,"lookback":300,"minViewers":1,"maxAwards":100,"budget":1000,"tradeRequired":true,"excludePrevious":false}'::jsonb
  else
    (c.config - array['kills','wins']::text[]) || jsonb_build_object('events', jsonb_build_object(
      'kill1', jsonb_build_object('enabled', coalesce((c.config->'kills'->>'enabled')::boolean,false) and coalesce((c.config->'kills'->>'every')::integer,0)=1, 'type',coalesce(c.config->'kills'->'type','"coins"'::jsonb),'coins',coalesce(c.config->'kills'->'coins','5'::jsonb),'min',coalesce(c.config->'kills'->'min','2'::jsonb),'max',coalesce(c.config->'kills'->'max','20'::jsonb)),
      'kill2', jsonb_build_object('enabled', coalesce((c.config->'kills'->>'enabled')::boolean,false) and coalesce((c.config->'kills'->>'every')::integer,0)=2, 'type',coalesce(c.config->'kills'->'type','"coins"'::jsonb),'coins',coalesce(c.config->'kills'->'coins','5'::jsonb),'min',coalesce(c.config->'kills'->'min','2'::jsonb),'max',coalesce(c.config->'kills'->'max','20'::jsonb)),
      'kill3', jsonb_build_object('enabled', coalesce((c.config->'kills'->>'enabled')::boolean,false) and coalesce((c.config->'kills'->>'every')::integer,0)=3, 'type',coalesce(c.config->'kills'->'type','"coins"'::jsonb),'coins',coalesce(c.config->'kills'->'coins','5'::jsonb),'min',coalesce(c.config->'kills'->'min','2'::jsonb),'max',coalesce(c.config->'kills'->'max','20'::jsonb)),
      'kill4', jsonb_build_object('enabled', coalesce((c.config->'kills'->>'enabled')::boolean,false) and coalesce((c.config->'kills'->>'every')::integer,0)=4, 'type',coalesce(c.config->'kills'->'type','"coins"'::jsonb),'coins',coalesce(c.config->'kills'->'coins','5'::jsonb),'min',coalesce(c.config->'kills'->'min','2'::jsonb),'max',coalesce(c.config->'kills'->'max','20'::jsonb)),
      'ace', jsonb_build_object('enabled', coalesce((c.config->'kills'->>'enabled')::boolean,false) and coalesce((c.config->'kills'->>'every')::integer,0)>=5, 'type',coalesce(c.config->'kills'->'type','"coins"'::jsonb),'coins',coalesce(c.config->'kills'->'coins','5'::jsonb),'min',coalesce(c.config->'kills'->'min','2'::jsonb),'max',coalesce(c.config->'kills'->'max','20'::jsonb)),
      'win', jsonb_build_object('enabled',coalesce((c.config->'wins'->>'enabled')::boolean,false),'type',coalesce(c.config->'wins'->'type','"coins"'::jsonb),'coins',coalesce(c.config->'wins'->'coins','5'::jsonb),'min',coalesce(c.config->'wins'->'min','2'::jsonb),'max',coalesce(c.config->'wins'->'max','20'::jsonb))
    ))
end
where not c.config ? 'events';
