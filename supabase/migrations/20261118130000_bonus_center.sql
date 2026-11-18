create table public.rewards_bonus_claims (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.rewards_users(id),
 request_id uuid not null,
 claimed_at timestamptz not null,
 reward jsonb not null,
 unique(user_id,request_id)
);
create index rewards_bonus_claims_user_time on public.rewards_bonus_claims(user_id,claimed_at desc);
create table public.rewards_bonus_telegram_links (
 user_id uuid primary key references public.rewards_users(id),
 token_hash text unique check(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz,
 telegram_id text unique check(telegram_id ~ '^[1-9][0-9]{0,19}$')
);
create table public.rewards_bonus_telegram_claims (
 user_id uuid primary key references public.rewards_users(id),
 telegram_id text not null unique,
 transaction_id uuid not null unique references public.rewards_coin_transactions(id),
 claimed_at timestamptz not null default clock_timestamp()
);
alter table public.rewards_bonus_claims enable row level security;
alter table public.rewards_bonus_telegram_links enable row level security;
alter table public.rewards_bonus_telegram_claims enable row level security;
revoke all on public.rewards_bonus_claims,public.rewards_bonus_telegram_links,public.rewards_bonus_telegram_claims from public,anon,authenticated;
grant select,insert,update on public.rewards_bonus_claims,public.rewards_bonus_telegram_links to service_role;
grant select,insert on public.rewards_bonus_telegram_claims to service_role;

-- A cosmetic grant references its bonus receipt; purchases keep their wallet receipt.
alter table public.rewards_profile_owned
 alter column transaction_id drop not null,
 add column bonus_claim_id uuid references public.rewards_bonus_claims(id),
 add constraint rewards_profile_owned_receipt check((transaction_id is not null) <> (bonus_claim_id is not null));
alter table public.rewards_vault_key_ledger
 drop constraint rewards_vault_key_ledger_kind_check,
 add constraint rewards_vault_key_ledger_kind_check check(kind in ('game_day','mission','stream_win','promo','promo_grant','bonus_grant','contribution','expiry'));

create function public.rewards_bonus_center(p_actor text,p_action text,p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 player public.rewards_users%rowtype;
 stamp timestamptz := clock_timestamp();
 latest public.rewards_bonus_claims%rowtype;
 receipt uuid;
 request uuid;
 options text[] := array['xp','coins','doors'];
 selected text;
 payout jsonb;
 skin record;
 frame record;
 prize uuid;
 win uuid;
 amount integer;
 week_at date;
 vault public.rewards_vault_seasons%rowtype;
 telegram text;
begin
 if p_action='telegram_bind' then
  if coalesce(p_body->>'tokenHash','') !~ '^[a-f0-9]{64}$'
    or coalesce(p_body->>'telegramId','') !~ '^[1-9][0-9]{0,19}$' then raise exception 'invalid_request'; end if;
  update public.rewards_bonus_telegram_links set telegram_id=p_body->>'telegramId',token_hash=null,expires_at=null
   where token_hash=p_body->>'tokenHash' and expires_at>stamp;
  if not found then raise exception 'link_expired'; end if;
  return jsonb_build_object('ok',true);
 end if;
 if p_action not in ('state','claim','telegram_link','telegram_claim') or p_action is null then raise exception 'invalid_request'; end if;
 -- Vault operations take their global lock before locking any player row.
 if p_action='claim' then perform pg_advisory_xact_lock(7268021,1); end if;
 select * into player from public.rewards_users where twitch_user_id=p_actor for update;
 if not found or coalesce(player.banned,false) or coalesce(player.participation_restricted,false) then raise exception 'user_unavailable'; end if;

 if p_action='telegram_link' then
  if coalesce(p_body->>'tokenHash','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid_request'; end if;
  if exists(select 1 from public.rewards_bonus_telegram_claims where user_id=player.id) then return jsonb_build_object('ok',true,'claimed',true); end if;
  insert into public.rewards_bonus_telegram_links(user_id,token_hash,expires_at)
   values(player.id,p_body->>'tokenHash',stamp+interval '15 minutes')
   on conflict(user_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at;
  return jsonb_build_object('ok',true);
 end if;
 if p_action='telegram_claim' then
  if exists(select 1 from public.rewards_bonus_telegram_claims where user_id=player.id) then return jsonb_build_object('ok',true,'claimed',true,'amount',10); end if;
  select telegram_id into telegram from public.rewards_bonus_telegram_links where user_id=player.id;
  if telegram is null or telegram is distinct from p_body->>'telegramId' then raise exception 'telegram_not_linked'; end if;
  if exists(select 1 from public.rewards_bonus_telegram_claims where telegram_id=telegram) then raise exception 'telegram_already_used'; end if;
  insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
   values(player.id,10,'adjustment','Бонус за подписку на Telegram Dropso') returning id into receipt;
  insert into public.rewards_bonus_telegram_claims(user_id,telegram_id,transaction_id) values(player.id,telegram,receipt);
  return jsonb_build_object('ok',true,'claimed',true,'amount',10);
 end if;

 select * into latest from public.rewards_bonus_claims where user_id=player.id order by claimed_at desc,id limit 1;
 if p_action='state' then
  return jsonb_build_object('login',player.twitch_login,'serverNow',stamp,'available',latest.id is null or latest.claimed_at+interval '24 hours'<=stamp,
   'nextAt',latest.claimed_at+interval '24 hours','lastReward',latest.reward,
   'telegramLinked',exists(select 1 from public.rewards_bonus_telegram_links where user_id=player.id and telegram_id is not null),
   'telegramClaimed',exists(select 1 from public.rewards_bonus_telegram_claims where user_id=player.id));
 end if;
 request:=(p_body->>'requestId')::uuid;
 if request is null then raise exception 'invalid_request'; end if;
 select * into latest from public.rewards_bonus_claims where user_id=player.id and request_id=request;
 if found then return jsonb_build_object('ok',true,'reward',latest.reward,'nextAt',latest.claimed_at+interval '24 hours','serverNow',stamp); end if;
 select * into latest from public.rewards_bonus_claims where user_id=player.id order by claimed_at desc,id limit 1;
 if latest.claimed_at+interval '24 hours'>stamp then raise exception 'bonus_cooldown'; end if;

 select offers.* into skin from (
  select p.name,p.image_url,p.sell_price_coins as price,null::text as wear,null::text as variant_kind
   from public.rewards_prizes p where p.status='available' and p.sell_price_coins between 1 and 10 and p.unlimited
  union all
  select i.name,i.image_url,v.price_coins,v.wear,v.variant_kind from public.rewards_shop_item_variants v
   join public.rewards_shop_items i on i.id=v.shop_item_id
   where v.available and i.status='available' and (i.stock is null or i.stock>0) and v.price_coins between 1 and 10
 ) offers order by gen_random_uuid() limit 1;
 if found then options:=array_append(options,'skin'); end if;
 select c.* into frame from public.rewards_profile_catalog c where c.kind='frame' and c.tier='simple'
  and not exists(select 1 from public.rewards_profile_owned o where o.user_id=player.id and o.item_id=c.id)
  order by gen_random_uuid() limit 1;
 if found then options:=array_append(options,'frame'); end if;
 if stamp>=timestamptz '2026-11-01 21:00:00+00' and stamp<timestamptz '2026-12-12 21:00:00+00' then options:=array_append(options,'sp'); end if;
 week_at:=public.rewards_vault_week(public.rewards_vault_now());
 select * into vault from public.rewards_vault_seasons where week=week_at for update;
 if found and vault.status='scheduled' and vault.settled_at is null
  and public.rewards_vault_now()>=vault.starts_at and public.rewards_vault_now()<vault.ends_at
  and coalesce((select earned from public.rewards_vault_wallets where week=week_at and user_id=player.id),0)<vault.key_cap
 then options:=array_append(options,'vault_key'); end if;
 selected:=options[public.rewards_crypto_index(cardinality(options))+1];
 insert into public.rewards_bonus_claims(user_id,request_id,claimed_at,reward) values(player.id,request,stamp,'{}') returning id into receipt;
 case selected
 when 'coins' then
  amount:=public.rewards_crypto_index(7)+1;
  insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(player.id,amount,'adjustment','Бонус дня · '||receipt);
  payout:=jsonb_build_object('type','coins','amount',amount,'title',amount||' монет','url','/account');
 when 'xp' then
  perform public.rewards_award_xp(player.id,100,'Бонус дня','bonus_day',receipt::text);
  payout:=jsonb_build_object('type','xp','amount',100,'title','100 XP','url','/account');
 when 'sp' then
  insert into public.rewards_season_progress as p(user_id,season_id,sp) values(player.id,'s1',150)
   on conflict(user_id,season_id) do update set sp=p.sp+150,updated_at=stamp;
  payout:=jsonb_build_object('type','sp','amount',150,'title','150 SP','url','/season');
 when 'doors' then
  amount:=case public.rewards_crypto_index(2) when 0 then 10 else 20 end;
  insert into public.rewards_promo_game_credits as c(user_id,game,stake,balance) values(player.id,'three_doors',amount,1)
   on conflict(user_id,game,stake) do update set balance=c.balance+1;
  payout:=jsonb_build_object('type','doors','amount',amount,'title','Бесплатная игра в «Три двери»','description','Вход за '||amount||' монет оплачен бонусом.','url','/games/three-doors');
 when 'skin' then
  insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
   values(skin.name,skin.image_url,'disabled',true,1,skin.price) returning id into prize;
  insert into public.rewards_wins(user_id,prize_id,won_at,delivery_status,choice_status,source_type,item_wear,item_variant_kind)
   values(player.id,prize,stamp,'awaiting_choice','awaiting_choice','promo_upgrade',skin.wear,skin.variant_kind) returning id into win;
  payout:=jsonb_build_object('type','skin','title','Скин для апгрейда','description',skin.name,'amount',skin.price,'image',skin.image_url,'winId',win,'url','/upgrader');
 when 'frame' then
  insert into public.rewards_profile_owned(user_id,item_id,request_id,bonus_claim_id) values(player.id,frame.id,receipt,receipt);
  payout:=jsonb_build_object('type','frame','title','Обычная рамка профиля','description',frame.name,'frame',frame.id,'url','/profile/customize');
 when 'vault_key' then
  insert into public.rewards_vault_wallets(week,user_id) values(week_at,player.id) on conflict(week,user_id) do nothing;
  update public.rewards_vault_wallets set earned=earned+1,balance=balance+1 where week=week_at and user_id=player.id and earned<vault.key_cap;
  if not found then raise exception 'vault_key_limit'; end if;
  insert into public.rewards_vault_key_ledger(week,user_id,amount,kind,event_key,details)
   values(week_at,player.id,1,'bonus_grant',receipt::text,jsonb_build_object('source','bonus_day'));
  payout:=jsonb_build_object('type','vault_key','amount',1,'title','1 ключ THE VAULT','url','/vault');
 end case;
 payout:=payout||jsonb_build_object('receiptId',receipt);
 update public.rewards_bonus_claims set reward=payout where id=receipt;
 return jsonb_build_object('ok',true,'reward',payout,'nextAt',stamp+interval '24 hours','serverNow',stamp);
end;
$$;
revoke all on function public.rewards_bonus_center(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_bonus_center(text,text,jsonb) to service_role;

notify pgrst,'reload schema';
