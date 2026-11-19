-- Atomic redemption for a verified Telegram subscription received from the relay.
-- The public/browser roles cannot call this routine.
create function public.rewards_bonus_telegram_relay_claim(p_token_hash text,p_telegram_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare target uuid; player public.rewards_users%rowtype; receipt uuid; stamp timestamptz;
begin
 if coalesce(p_token_hash,'') !~ '^[a-f0-9]{64}$' or coalesce(p_telegram_id,'') !~ '^[1-9][0-9]{0,19}$' then raise exception 'invalid_request';end if;
 select l.user_id into target from public.rewards_bonus_telegram_links l where l.token_hash=p_token_hash and l.expires_at>clock_timestamp();
 if not found then
  -- A successful claim consumed its token; Telegram may retry the same update.
  if exists(select 1 from public.rewards_bonus_telegram_claims c where c.telegram_id=p_telegram_id) then return jsonb_build_object('ok',true,'claimed',true,'amount',10);end if;
  raise exception 'link_expired';
 end if;
 select * into player from public.rewards_users where id=target for update;
 if not found or coalesce(player.banned,false) or coalesce(player.participation_restricted,false) then raise exception 'user_unavailable';end if;
 stamp:=clock_timestamp();
 if exists(select 1 from public.rewards_bonus_telegram_claims c where c.user_id=player.id and c.telegram_id=p_telegram_id) then return jsonb_build_object('ok',true,'claimed',true,'amount',10);end if;
 if exists(select 1 from public.rewards_bonus_telegram_claims c where c.user_id=player.id or c.telegram_id=p_telegram_id) then raise exception 'telegram_already_used';end if;
 update public.rewards_bonus_telegram_links set telegram_id=p_telegram_id,token_hash=null,expires_at=null where user_id=player.id and token_hash=p_token_hash and expires_at>stamp;
 if not found then raise exception 'link_expired';end if;
 insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(player.id,10,'adjustment','Бонус за подписку на Telegram Dropso') returning id into receipt;
 insert into public.rewards_bonus_telegram_claims(user_id,telegram_id,transaction_id) values(player.id,p_telegram_id,receipt);
 return jsonb_build_object('ok',true,'claimed',true,'amount',10);
end $$;
revoke all on function public.rewards_bonus_telegram_relay_claim(text,text) from public,anon,authenticated;
grant execute on function public.rewards_bonus_telegram_relay_claim(text,text) to service_role;
notify pgrst,'reload schema';
