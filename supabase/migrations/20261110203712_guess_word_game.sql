-- Standalone paid word puzzle. Only service_role may call these routines.
create table public.rewards_guess_rounds (
 id uuid primary key default gen_random_uuid(), secret_word text not null check(secret_word ~ '^[а-яa-z]{2,24}$'),
 hint text not null check(char_length(hint) between 1 and 180), cost integer not null check(cost between 1 and 10000),
 prize_coins integer check(prize_coins between 1 and 1000000), prize_id uuid unique references public.rewards_prizes(id),
 status text not null default 'active' check(status in ('active','won','cancelled')),
 winner_id uuid references public.rewards_users(id), win_id uuid references public.rewards_wins(id),
 actor text not null, request_id uuid not null, creation jsonb not null,
 created_at timestamptz not null default now(), ended_at timestamptz,
 check((prize_coins is null) <> (prize_id is null)), unique(actor,request_id)
);
create unique index rewards_guess_one_active on public.rewards_guess_rounds ((true)) where status='active';
create index rewards_guess_rounds_created on public.rewards_guess_rounds(created_at desc,id);
create index rewards_guess_rounds_winner on public.rewards_guess_rounds(winner_id);
create index rewards_guess_rounds_win on public.rewards_guess_rounds(win_id);
create table public.rewards_guess_attempts (
 id bigint generated always as identity primary key, round_id uuid not null references public.rewards_guess_rounds(id),
 user_id uuid not null references public.rewards_users(id), request_id uuid not null, guess text not null,
 cost integer not null check(cost>0), correct boolean not null, refunded boolean not null default false,
 created_at timestamptz not null default now(), unique(round_id,guess), unique(user_id,request_id)
);
create index rewards_guess_attempts_recent on public.rewards_guess_attempts(round_id,id desc);
alter table public.rewards_guess_rounds enable row level security;
alter table public.rewards_guess_attempts enable row level security;
revoke all on public.rewards_guess_rounds,public.rewards_guess_attempts from public,anon,authenticated;
grant select,insert,update on public.rewards_guess_rounds,public.rewards_guess_attempts to service_role;
grant usage,select on sequence public.rewards_guess_attempts_id_seq to service_role;

create function public.rewards_guess_normalize(value text) returns text language sql immutable strict set search_path='' as $$
 select replace(lower(btrim(value)),'ё','е')
$$;
create function public.rewards_guess_state(p_round uuid,p_user uuid) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('balance',(select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=p_user),
 'round',(select jsonb_build_object('id',r.id,'hint',r.hint,'length',char_length(r.secret_word),'cost',r.cost,'status',r.status,
 'prizeCoins',r.prize_coins,'prize',case when p.id is null then null else jsonb_build_object('name',p.name,'image',p.image_url) end,
 'answer',case when r.status='won' then r.secret_word else null end,
 'winner',case when r.status='won' then jsonb_build_object('login',u.twitch_login,'name',u.twitch_display_name) else null end,
 'wonByMe',coalesce(r.winner_id=p_user,false),
 'recent',(select coalesce(jsonb_agg(t.guess order by t.id desc),'[]'::jsonb) from (select a.id,a.guess from public.rewards_guess_attempts a where a.round_id=r.id and not a.correct order by a.id desc limit 20)t))
 from public.rewards_guess_rounds r left join public.rewards_prizes p on p.id=r.prize_id left join public.rewards_users u on u.id=r.winner_id where r.id=p_round))
$$;

create function public.rewards_guess_word(p_actor text,p_action text,p_body jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare me public.rewards_users; r public.rewards_guess_rounds; attempt_row public.rewards_guess_attempts; p public.rewards_prizes;
 normalized text; request uuid; balance bigint; result jsonb; target uuid; prize uuid; won uuid; entry record; original jsonb;
begin
 if jsonb_typeof(p_body) is distinct from 'object' then raise exception 'invalid_request';end if;
 if p_action in ('admin','start','cancel') then
  if not exists(select 1 from public.rewards_streamers where is_primary and twitch_broadcaster_id=p_actor) then raise exception 'owner_required';end if;
  if p_action='admin' then
   return jsonb_build_object('rounds',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) from (
    select gr.id,gr.secret_word as word,gr.hint,gr.cost,gr.prize_coins as "prizeCoins",gp.name as "prizeName",gr.status,gr.created_at,
    (select count(*) from public.rewards_guess_attempts ga where ga.round_id=gr.id) as attempts,
    (select coalesce(sum(ga.cost) filter(where not refunded),0) from public.rewards_guess_attempts ga where ga.round_id=gr.id) as spent
    from public.rewards_guess_rounds gr left join public.rewards_prizes gp on gp.id=gr.prize_id order by gr.created_at desc limit 10)t),
    'prizes',(select coalesce(jsonb_agg(to_jsonb(t) order by t.name),'[]'::jsonb) from (
     select gp.id,gp.name,gp.image_url as image,gp.sell_price_coins as value from public.rewards_prizes gp
     where gp.status in ('available','disabled') and gp.sell_price_coins is not null
     and not exists(select 1 from public.rewards_guess_rounds gr where gr.prize_id=gp.id)
     and strpos(lower(gp.name),lower(left(coalesce(p_body->>'query',''),80)))>0 order by gp.name,gp.id limit 50)t));
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('guess-word-admin',0));
  if p_action='start' then
   normalized:=public.rewards_guess_normalize(p_body->>'word');request:=(p_body->>'requestId')::uuid;
   if normalized is null or normalized !~ '^[а-яa-z]{2,24}$' or request is null or
    coalesce(char_length(btrim(p_body->>'hint')),0) not between 1 and 180 or
    coalesce((p_body->>'cost')::integer,0) not between 1 and 10000 then raise exception 'invalid_request';end if;
   select * into r from public.rewards_guess_rounds where actor=p_actor and request_id=request;
   if found then if r.creation<>p_body then raise exception 'request_conflict';end if;return jsonb_build_object('ok',true,'roundId',r.id);end if;
   if exists(select 1 from public.rewards_guess_rounds where status='active') then raise exception 'round_active';end if;
   if p_body->>'prizeType'='coins' then
    if coalesce((p_body->>'prizeCoins')::integer,0) not between 1 and 1000000 or p_body->>'prizeId' is not null then raise exception 'invalid_request';end if;
   elsif p_body->>'prizeType'='skin' then
    if p_body->>'prizeCoins' is not null then raise exception 'invalid_request';end if;
    select * into p from public.rewards_prizes where id=(p_body->>'prizeId')::uuid and status in ('available','disabled') and sell_price_coins is not null;
    if not found or exists(select 1 from public.rewards_guess_rounds where prize_id=p.id) then raise exception 'invalid_prize';end if;
    -- Dedicated disabled copy belongs exclusively to this puzzle. No stream/drop stock is changed.
    insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
    values(p.name,p.image_url,'disabled',true,1,p.sell_price_coins) returning id into prize;
   else raise exception 'invalid_request';end if;
   insert into public.rewards_guess_rounds(secret_word,hint,cost,prize_coins,prize_id,actor,request_id,creation)
   values(normalized,btrim(p_body->>'hint'),(p_body->>'cost')::integer,case when prize is null then (p_body->>'prizeCoins')::integer end,prize,p_actor,request,p_body) returning id into target;
   insert into public.rewards_audit_log(actor_twitch_user_id,action,entity_type,entity_id,details) values(p_actor,'guess_word_start','guess_word',target,jsonb_build_object('cost',p_body->'cost','prizeType',p_body->'prizeType'));
   return jsonb_build_object('ok',true,'roundId',target);
  end if;
  select * into r from public.rewards_guess_rounds where id=(p_body->>'roundId')::uuid for update;
  if not found then raise exception 'round_closed';end if;
  if r.status='won' then raise exception 'round_closed';end if;
  if r.status='active' then
   -- Same wallet row locks as all other purchases. Refund each participant once.
   for entry in select a.user_id,sum(a.cost)::integer as amount from public.rewards_guess_attempts a where a.round_id=r.id and not a.refunded group by a.user_id order by a.user_id loop
    perform 1 from public.rewards_users where id=entry.user_id for update;
    insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(entry.user_id,entry.amount,'adjustment','Угадай слово · возврат · '||r.id);
   end loop;
   update public.rewards_guess_attempts set refunded=true where round_id=r.id;
   update public.rewards_guess_rounds set status='cancelled',ended_at=now() where id=r.id;
   insert into public.rewards_audit_log(actor_twitch_user_id,action,entity_type,entity_id,details) values(p_actor,'guess_word_cancel','guess_word',r.id,'{}');
  end if;
  return jsonb_build_object('ok',true);
 end if;
 if p_action not in ('state','guess') then raise exception 'invalid_action';end if;
 if p_action='state' then
  select * into me from public.rewards_users where twitch_user_id=p_actor and not banned and not participation_restricted;
  if not found then raise exception 'user_unavailable';end if;
  select id into target from public.rewards_guess_rounds order by created_at desc,id desc limit 1;
  return public.rewards_guess_state(target,me.id);
 end if;
 normalized:=public.rewards_guess_normalize(p_body->>'guess');request:=(p_body->>'requestId')::uuid;
 if normalized is null or normalized !~ '^[а-яa-z]{2,24}$' or request is null then raise exception 'invalid_request';end if;
 -- Serialize every attempt/cancellation on the round, then lock the personal wallet.
 select * into r from public.rewards_guess_rounds where id=(p_body->>'roundId')::uuid for update;
 if not found then raise exception 'round_closed';end if;
 select * into me from public.rewards_users where twitch_user_id=p_actor and not banned and not participation_restricted for update;
 if not found then raise exception 'user_unavailable';end if;
 select * into attempt_row from public.rewards_guess_attempts where user_id=me.id and request_id=request;
 if found then
  if attempt_row.round_id<>r.id or attempt_row.guess<>normalized then raise exception 'request_conflict';end if;
  return public.rewards_guess_state(r.id,me.id)||jsonb_build_object('result',case when attempt_row.correct then 'won' else 'wrong' end,'replayed',true);
 end if;
 if r.status<>'active' then raise exception 'round_closed';end if;
 if char_length(normalized)<>char_length(r.secret_word) then raise exception 'invalid_length';end if;
 if exists(select 1 from public.rewards_guess_attempts where round_id=r.id and guess=normalized) then
  return public.rewards_guess_state(r.id,me.id)||jsonb_build_object('result','duplicate');
 end if;
 select coalesce(sum(amount),0) into balance from public.rewards_coin_transactions where user_id=me.id;
 if balance<r.cost then raise exception 'insufficient_coins';end if;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(me.id,-r.cost,'adjustment','Угадай слово · попытка · '||r.id);
 insert into public.rewards_guess_attempts(round_id,user_id,request_id,guess,cost,correct) values(r.id,me.id,request,normalized,r.cost,normalized=r.secret_word);
 if normalized=r.secret_word then
  if r.prize_coins is not null then
   insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(me.id,r.prize_coins,'adjustment','Угадай слово · приз · '||r.id);
  else
   insert into public.rewards_wins(round_id,user_id,prize_id,delivery_status,choice_status,source_type) values(null,me.id,r.prize_id,'awaiting_choice','awaiting_choice','guess_word') returning id into won;
  end if;
  update public.rewards_guess_rounds set status='won',winner_id=me.id,win_id=won,ended_at=now() where id=r.id;
 end if;
 return public.rewards_guess_state(r.id,me.id)||jsonb_build_object('result',case when normalized=r.secret_word then 'won' else 'wrong' end);
end $$;
revoke all on function public.rewards_guess_normalize(text),public.rewards_guess_state(uuid,uuid),public.rewards_guess_word(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_guess_normalize(text),public.rewards_guess_state(uuid,uuid),public.rewards_guess_word(text,text,jsonb) to service_role;
