-- Closed owner-only recipient pilot. All financial effects are transactional.
create table public.rewards_challenge_testers (
 user_id uuid primary key references public.rewards_users(id) on delete cascade
);
create table public.rewards_challenges (
 id uuid primary key,
 user_id uuid not null references public.rewards_users(id),
 owner_twitch_id text not null,
 description text not null check (char_length(description) between 1 and 140),
 stake integer not null check (stake between 5 and 1000),
 status text not null default 'pending' check (status in ('pending','accepted','declined','completed','failed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index rewards_challenges_user_created_idx on public.rewards_challenges(user_id,created_at desc);
alter table public.rewards_challenge_testers enable row level security;
alter table public.rewards_challenges enable row level security;
revoke all on public.rewards_challenge_testers,public.rewards_challenges from public,anon,authenticated;
grant select,insert,update,delete on public.rewards_challenge_testers,public.rewards_challenges to service_role;
create function public.rewards_challenges_rpc(p_actor text,p_action text,p_body jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare u public.rewards_users%rowtype; c public.rewards_challenges%rowtype; owner_id text; owner_login text; is_owner boolean; amount integer; description_text text; request_id uuid; target_id uuid; balance bigint; rows jsonb;
begin
 select twitch_broadcaster_id into owner_id from public.rewards_streamers where is_primary and enabled;
 if owner_id is null then raise exception 'challenge_unavailable'; end if;
 select twitch_login into owner_login from public.rewards_users where twitch_user_id=owner_id;
 is_owner:=p_actor=owner_id and exists(select 1 from public.rewards_admins where twitch_user_id=p_actor);
 if p_action in ('admin_state','invite','accept','decline','complete','fail') and not is_owner then raise exception 'owner_required'; end if;
 if p_action='invite' then
  select id into target_id from public.rewards_users where lower(twitch_login)=lower(trim(p_body->>'login')) and not coalesce(banned,false);
  if target_id is null then raise exception 'user_not_found'; end if;
  insert into public.rewards_challenge_testers(user_id) values(target_id) on conflict do nothing;
  return jsonb_build_object('ok',true);
 end if;
 if p_action='admin_state' then
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) into rows from
   (select ch.*,usr.twitch_login from public.rewards_challenges ch join public.rewards_users usr on usr.id=ch.user_id where ch.owner_twitch_id=owner_id order by ch.created_at desc limit 200)t;
  return jsonb_build_object('rows',rows,'owner',owner_login);
 end if;
 if p_action in ('accept','decline','complete','fail') then
  request_id:=(p_body->>'id')::uuid;
  select * into c from public.rewards_challenges where id=request_id and owner_twitch_id=owner_id for update;
  if not found then raise exception 'challenge_not_found'; end if;
  if (p_action='accept' and c.status='accepted') or (p_action='decline' and c.status='declined') or (p_action='complete' and c.status='completed') or (p_action='fail' and c.status='failed') then return to_jsonb(c); end if;
  if p_action in ('accept','decline') and c.status<>'pending' or p_action in ('complete','fail') and c.status<>'accepted' then raise exception 'invalid_status'; end if;
  select * into u from public.rewards_users where id=c.user_id for update;
  if p_action='accept' then
   if coalesce(u.banned,false) then raise exception 'user_required'; end if;
   select coalesce(sum(amount),0) into balance from public.rewards_coin_transactions where user_id=c.user_id;
   if balance<c.stake then raise exception 'insufficient_coins'; end if;
   insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(c.user_id,-c.stake,'adjustment','Челлендж · резерв · '||c.id);
  elsif p_action='fail' then
   insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(c.user_id,c.stake,'adjustment','Челлендж · возврат · '||c.id),(c.user_id,c.stake,'adjustment','Челлендж · выигрыш · '||c.id);
  end if;
  update public.rewards_challenges set status=case p_action when 'accept' then 'accepted' when 'decline' then 'declined' when 'complete' then 'completed' else 'failed' end,updated_at=now() where id=c.id returning * into c;
  return to_jsonb(c);
 end if;
 select * into u from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false) for update;
 if not found then raise exception 'user_required'; end if;
 if not is_owner and not exists(select 1 from public.rewards_challenge_testers where user_id=u.id) then raise exception 'pilot_closed'; end if;
 if p_action='create' then
  request_id:=(p_body->>'id')::uuid;description_text:=trim(p_body->>'description');amount:=(p_body->>'stake')::integer;
  if request_id is null or description_text is null or char_length(description_text) not between 1 and 140 or amount is null or amount not between 5 and 1000 then raise exception 'invalid_request'; end if;
  select * into c from public.rewards_challenges where id=request_id;
  if found then
   if c.user_id<>u.id or c.description<>description_text or c.stake<>amount then raise exception 'request_conflict'; end if;
   return to_jsonb(c);
  end if;
  select coalesce(sum(t.amount),0) into balance from public.rewards_coin_transactions t where t.user_id=u.id;
  if balance<amount then raise exception 'insufficient_coins'; end if;
  insert into public.rewards_challenges(id,user_id,owner_twitch_id,description,stake) values(request_id,u.id,owner_id,description_text,amount) returning * into c;
  return to_jsonb(c);
 elsif p_action='state' then
  select coalesce(sum(t.amount),0) into balance from public.rewards_coin_transactions t where t.user_id=u.id;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) into rows from (select id,description,stake,status,created_at,updated_at from public.rewards_challenges where user_id=u.id order by created_at desc limit 100)t;
  return jsonb_build_object('rows',rows,'balance',balance,'owner',coalesce(owner_login,'d1psy'));
 else raise exception 'invalid_action';
 end if;
end $$;
revoke all on function public.rewards_challenges_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_challenges_rpc(text,text,jsonb) to service_role;
