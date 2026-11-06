-- Persistent device logins and private Web Push delivery queue. No economic writes.
create schema if not exists rewards_private;
revoke all on schema rewards_private from public, anon, authenticated;

create table public.rewards_device_sessions (
 token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
 user_id uuid not null references public.rewards_users(id) on delete cascade,
 created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '180 days',
 hard_expires_at timestamptz not null default now()+interval '365 days'
);
create index rewards_device_sessions_user_idx on public.rewards_device_sessions(user_id);
create index rewards_device_sessions_expiry_idx on public.rewards_device_sessions(expires_at);

create table public.rewards_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.rewards_users(id) on delete cascade,
 device_token_hash text references public.rewards_device_sessions(token_hash) on delete cascade,
 endpoint text not null unique check (length(endpoint) between 20 and 4096),
 p256dh text not null, auth text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index rewards_push_subscriptions_user_idx on public.rewards_push_subscriptions(user_id);
create index rewards_push_subscriptions_device_idx on public.rewards_push_subscriptions(device_token_hash);
create table public.rewards_push_jobs (
 id uuid primary key default gen_random_uuid(),
 subscription_id uuid not null references public.rewards_push_subscriptions(id) on delete cascade,
 win_id uuid references public.rewards_wins(id) on delete cascade,
 payload jsonb not null,
 status text not null default 'queued' check(status in ('queued','sending','done','failed')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(), lease_until timestamptz,
 created_at timestamptz not null default now(), last_error text,
 unique(subscription_id,win_id)
);
create index rewards_push_jobs_pending_idx on public.rewards_push_jobs(next_attempt_at) where status in ('queued','sending');
create table public.rewards_push_config (
 id boolean primary key default true check(id), public_key text not null,
 private_secret_id uuid not null, dispatch_secret_id uuid not null,
 dispatch_url text not null, subject text not null
);

alter table public.rewards_device_sessions enable row level security;
alter table public.rewards_push_subscriptions enable row level security;
alter table public.rewards_push_jobs enable row level security;
alter table public.rewards_push_config enable row level security;
revoke all on public.rewards_device_sessions,public.rewards_push_subscriptions,public.rewards_push_jobs,public.rewards_push_config from public,anon,authenticated;
grant select,insert,update,delete on public.rewards_device_sessions,public.rewards_push_subscriptions,public.rewards_push_jobs,public.rewards_push_config to service_role;

create function public.rewards_device_resolve(p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.rewards_device_sessions; u public.rewards_users;
begin
 select * into d from public.rewards_device_sessions where token_hash=p_hash;
 if not found or d.expires_at<=now() or d.hard_expires_at<=now() then return null; end if;
 select * into u from public.rewards_users where id=d.user_id;
 if not found or coalesce(u.banned,false) then return null; end if;
 if d.last_seen_at<now()-interval '1 day' then
  update public.rewards_device_sessions set last_seen_at=now(),expires_at=least(now()+interval '180 days',hard_expires_at) where token_hash=p_hash;
 end if;
 return jsonb_build_object('twitchUserId',u.twitch_user_id,'login',u.twitch_login,'displayName',coalesce(u.twitch_display_name,u.twitch_login),'expiresAt',least(now()+interval '180 days',d.hard_expires_at));
end $$;

create function public.rewards_push_subscribe(p_user uuid,p_device text,p_endpoint text,p_p256dh text,p_auth text) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('push:'||p_user::text,0));
 if not exists(select 1 from public.rewards_device_sessions where token_hash=p_device and user_id=p_user and expires_at>now() and hard_expires_at>now()) then raise exception 'device_required'; end if;
 if exists(select 1 from public.rewards_push_subscriptions where endpoint=p_endpoint and user_id<>p_user) then raise exception 'subscription_conflict'; end if;
 if (select count(*) from public.rewards_push_subscriptions where user_id=p_user)>=10 and not exists(select 1 from public.rewards_push_subscriptions where endpoint=p_endpoint and user_id=p_user) then raise exception 'device_limit'; end if;
 insert into public.rewards_push_subscriptions(user_id,device_token_hash,endpoint,p256dh,auth) values(p_user,p_device,p_endpoint,p_p256dh,p_auth)
 on conflict(endpoint) do update set device_token_hash=excluded.device_token_hash,p256dh=excluded.p256dh,auth=excluded.auth,updated_at=now() returning id into result;
 return result;
end $$;

-- The trigger runs for stream giveaway wins only, never shop/upgrader/contracts.
create function rewards_private.queue_drop_push() returns trigger language plpgsql security definer set search_path='' as $$
declare prize text;
begin
 if new.round_id is null or new.source_type is not null then return new; end if;
 select name into prize from public.rewards_prizes where id=new.prize_id;
 insert into public.rewards_push_jobs(subscription_id,win_id,payload)
 select s.id,new.id,jsonb_build_object('title','Тебе выпал дроп!','body',coalesce(prize,'Новый предмет')||' — открой инвентарь.','url','/account','tag','drop-'||new.id::text)
 from public.rewards_push_subscriptions s join public.rewards_device_sessions d on d.token_hash=s.device_token_hash
 where s.user_id=new.user_id and d.expires_at>now() and d.hard_expires_at>now()
 on conflict(subscription_id,win_id) do nothing;
 return new;
end $$;
revoke all on function rewards_private.queue_drop_push() from public,anon,authenticated;
create trigger rewards_win_push after insert on public.rewards_wins for each row execute function rewards_private.queue_drop_push();

create function public.rewards_push_claim() returns setof public.rewards_push_jobs language sql security invoker set search_path='' as $$
 update public.rewards_push_jobs j set status='sending',attempts=j.attempts+1,lease_until=now()+interval '3 minutes'
 where j.id in (
  select q.id from public.rewards_push_jobs q where q.created_at>now()-interval '24 hours' and q.attempts<6
  and ((q.status='queued' and q.next_attempt_at<=now()) or(q.status='sending' and q.lease_until<now()))
  order by q.created_at for update skip locked limit 20
 ) returning j.*;
$$;

-- Vault is deliberately accessible only through this service-only function.
create function public.rewards_push_credentials() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('publicKey',c.public_key,'privateKey',p.decrypted_secret,'dispatchKey',d.decrypted_secret,'subject',c.subject)
 from public.rewards_push_config c join vault.decrypted_secrets p on p.id=c.private_secret_id join vault.decrypted_secrets d on d.id=c.dispatch_secret_id where c.id=true;
$$;
revoke all on function public.rewards_device_resolve(text),public.rewards_push_subscribe(uuid,text,text,text,text),public.rewards_push_claim(),public.rewards_push_credentials() from public,anon,authenticated;
grant execute on function public.rewards_device_resolve(text),public.rewards_push_subscribe(uuid,text,text,text,text),public.rewards_push_claim(),public.rewards_push_credentials() to service_role;

create function public.rewards_push_test(p_user uuid,p_device text) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('push-test:'||p_device,0));
 if exists(select 1 from public.rewards_push_jobs j join public.rewards_push_subscriptions s on s.id=j.subscription_id where s.user_id=p_user and s.device_token_hash=p_device and j.win_id is null and j.created_at>now()-interval '1 minute') then raise exception 'test_rate_limit'; end if;
 insert into public.rewards_push_jobs(subscription_id,payload)
 select id,jsonb_build_object('title','D1PSY · Уведомления работают','body','Когда тебе выпадет дроп, здесь появится уведомление.','url','/account','tag','d1psy-push-test')
 from public.rewards_push_subscriptions where user_id=p_user and device_token_hash=p_device;
 if not found then raise exception 'subscription_required'; end if;
end $$;
revoke all on function public.rewards_push_test(uuid,text) from public,anon,authenticated;
grant execute on function public.rewards_push_test(uuid,text) to service_role;
