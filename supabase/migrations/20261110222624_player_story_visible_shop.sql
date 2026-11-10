-- Match the existing storefront hidden-name exclusions in both stock branches.
-- Read-only personal coin analytics. No balance/reward writes, no public grants.
create or replace function public.rewards_player_economy(p_user uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.rewards_users where id=p_user and not coalesce(banned,false)) then raise exception 'user_unavailable';end if;
 with clock as (select (now() at time zone 'Europe/Moscow')::date today),
 periods as (
  select 'today' key,today first_day,today+1 last_day from clock
  union all select 'week',today-6,today+1 from clock
  union all select 'month30',today-29,today+1 from clock
  union all select 'month',date_trunc('month',today)::date,today+1 from clock
  union all select 'previousMonth',(date_trunc('month',today)-interval '1 month')::date,date_trunc('month',today)::date from clock
  union all select 'all',null::date,today+1 from clock
 ), source_rows as (
  select settlement_transaction_id tx,'night-run' category from public.rewards_nr_games where user_id=p_user and settlement_transaction_id is not null
  union all select r.transaction_id,'night-run' from public.rewards_nr_rewards r join public.rewards_nr_games g on g.id=r.game_id where g.user_id=p_user
  union all select reward_transaction_id,'minesweeper' from public.rewards_ms_games where user_id=p_user and reward_transaction_id is not null
  union all select reward_transaction_id,'defuse' from public.rewards_defuse_games where user_id=p_user and reward_transaction_id is not null
  union all select reward_transaction_id,'wordly' from public.rewards_wordly_games where user_id=p_user and reward_transaction_id is not null
  union all select transaction_id,'weekly' from public.rewards_game_week_results where user_id=p_user and transaction_id is not null and reward>0
  union all select coin_transaction_id,case when round_id is not null then 'stream' else 'promo' end from public.rewards_streamer_live_awards where user_id=p_user and coin_transaction_id is not null
 ), sources as (select tx,case when count(distinct category)=1 then min(category) else 'other' end category from source_rows group by tx),
 ledger as materialized (
  select t.amount,t.created_at,(t.created_at at time zone 'Europe/Moscow')::date as day,
   case when s.category is not null and t.amount>0 then s.category
    when t.transaction_type='win_sale' then case when w.round_id is not null or exists(select 1 from public.rewards_streamer_live_awards a where a.user_id=p_user and a.win_id=w.id and a.round_id is not null) then 'stream' else 'sales' end
    when t.note like 'Угадай слово · попытка · %' and t.amount<0 and exists(select 1 from public.rewards_guess_attempts a where a.user_id=p_user and a.round_id::text=right(t.note,36) and a.cost=-t.amount) then 'word-attempt'
    when t.note like 'Угадай слово · возврат · %' and t.amount>0 and exists(select 1 from public.rewards_guess_attempts a where a.user_id=p_user and a.round_id::text=right(t.note,36) and a.refunded) then 'refund'
    when t.note like 'Угадай слово · приз · %' and t.amount>0 and exists(select 1 from public.rewards_guess_rounds g where g.winner_id=p_user and g.id::text=right(t.note,36) and g.prize_coins=t.amount) then 'word-prize'
    when t.transaction_type='shop_purchase' then case when t.note like 'Оформление профиля · %' then 'cosmetics' when t.note like 'shop_item:%' then 'shop' else 'other' end
    when t.transaction_type in ('gift_sent','gift_received') then 'gifts'
    when t.transaction_type='adjustment' and t.amount<0 and t.note='Доплата монет в апгрейдере' then 'upgrader'
    when t.transaction_type='referral_reward' then 'referral'
    when t.transaction_type='level_reward' then 'season'
    when t.transaction_type='adjustment' and t.amount>0 and t.note ~ '^Ежедневный бонус · день [1-7]$' then 'daily'
    when t.transaction_type='adjustment' and t.amount>0 and t.note like 'Промокод %' then 'promo'
    else 'other' end category
  from public.rewards_coin_transactions t left join sources s on s.tx=t.id left join public.rewards_wins w on w.id=t.win_id and w.user_id=p_user
  where t.user_id=p_user
 ), totals as (
  select p.key,coalesce(sum(l.amount) filter(where l.amount>0),0) credited,coalesce(-sum(l.amount) filter(where l.amount<0),0) debited,coalesce(sum(l.amount),0) net,count(l.amount) operations
  from periods p left join ledger l on (p.first_day is null or l.day>=p.first_day) and (p.key='all' or l.day<p.last_day) group by p.key
 ), categories as (
  select p.key,l.category,coalesce(sum(l.amount) filter(where l.amount>0),0) credited,coalesce(-sum(l.amount) filter(where l.amount<0),0) debited
  from periods p join ledger l on (p.first_day is null or l.day>=p.first_day) and (p.key='all' or l.day<p.last_day) group by p.key,l.category
 ), daily as (select day,coalesce(sum(amount) filter(where amount>0),0) credited,coalesce(-sum(amount) filter(where amount<0),0) debited from ledger group by day),
 word_stats as (
  select p.key,count(a.id) attempts,count(a.id) filter(where a.correct) wins,count(a.id) filter(where not a.correct) incorrect,
  coalesce(sum(a.cost) filter(where not a.correct and not a.refunded),0) failed_cost
  from periods p left join public.rewards_guess_attempts a on a.user_id=p_user and (p.first_day is null or (a.created_at at time zone 'Europe/Moscow')::date>=p.first_day) and (p.key='all' or (a.created_at at time zone 'Europe/Moscow')::date<p.last_day) group by p.key
 ), stock as (
  select i.id,i.name,i.image_url image,i.price_coins price from public.rewards_shop_items i where i.status='available' and i.name<>all(array['Glock-18 | Кролик в тени','CZ75-Auto | Фреймворк','AUG | Жуть','USP-S | Silent Shot','XM1014 | Ирэдзуми','M4A4 | Эолова тьма','M4A4 | Стальной каркас','Zeus x27 | Пиксельный камуфляж «Болото»','Tec-9 | Лимонная кислота','SCAR-20 | Песчаная сетка','P90 | Песчаное напыление','P250 | Ледяная корка','MAC-10 | Грозовой камуфляж','M249 | Ледяная корка','Наклейка | Париж-2023','Запечатанный граффити','Автомат «Галиль» | Серый дым']::text[]) and (i.stock is null or i.stock>0) and not exists(select 1 from public.rewards_shop_item_variants v where v.shop_item_id=i.id)
  union all select i.id,i.name||' · '||coalesce(v.wear,'')||case when v.variant_kind='stattrak' then ' · StatTrak™' when v.variant_kind='souvenir' then ' · Souvenir' else '' end,i.image_url,v.price_coins from public.rewards_shop_items i join public.rewards_shop_item_variants v on v.shop_item_id=i.id where i.status='available' and i.name<>all(array['Glock-18 | Кролик в тени','CZ75-Auto | Фреймворк','AUG | Жуть','USP-S | Silent Shot','XM1014 | Ирэдзуми','M4A4 | Эолова тьма','M4A4 | Стальной каркас','Zeus x27 | Пиксельный камуфляж «Болото»','Tec-9 | Лимонная кислота','SCAR-20 | Песчаная сетка','P90 | Песчаное напыление','P250 | Ледяная корка','MAC-10 | Грозовой камуфляж','M249 | Ледяная корка','Наклейка | Париж-2023','Запечатанный граффити','Автомат «Галиль» | Серый дым']::text[]) and (i.stock is null or i.stock>0) and v.available
 )
 select jsonb_build_object('generatedAt',now(),'timeZone','Europe/Moscow','periods',jsonb_object_agg(p.key,
  jsonb_build_object('from',p.first_day,'through',p.last_day-1,'credited',t.credited,'debited',t.debited,'net',t.net,'operations',t.operations,
   'categories',(select coalesce(jsonb_agg(jsonb_build_object('key',c.category,'credited',c.credited,'debited',c.debited) order by c.credited+c.debited desc,c.category),'[]') from categories c where c.key=p.key),
   'word',jsonb_build_object('attempts',ws.attempts,'wins',ws.wins,'incorrect',ws.incorrect,'failedCost',ws.failed_cost),
   'streamWins',(select count(*) from public.rewards_wins w where w.user_id=p_user and (w.round_id is not null or exists(select 1 from public.rewards_streamer_live_awards a where a.user_id=p_user and a.win_id=w.id and a.round_id is not null)) and (p.first_day is null or (w.won_at at time zone 'Europe/Moscow')::date>=p.first_day) and (p.key='all' or (w.won_at at time zone 'Europe/Moscow')::date<p.last_day))+
    (select count(*) from public.rewards_streamer_live_awards a where a.user_id=p_user and a.round_id is not null and a.win_id is null and (p.first_day is null or (a.created_at at time zone 'Europe/Moscow')::date>=p.first_day) and (p.key='all' or (a.created_at at time zone 'Europe/Moscow')::date<p.last_day)),
   'days',(select coalesce(jsonb_agg(jsonb_build_object('day',d::date,'credited',coalesce(x.credited,0),'debited',coalesce(x.debited,0)) order by d),'[]') from generate_series(greatest(coalesce(p.first_day,p.last_day-30),p.last_day-30)::timestamp,(p.last_day-1)::timestamp,interval '1 day') d left join daily x on x.day=d::date),
   'bestDay',(select jsonb_build_object('day',d.day,'net',d.credited-d.debited) from daily d where (p.first_day is null or d.day>=p.first_day) and (p.key='all' or d.day<p.last_day) and d.credited-d.debited>0 order by d.credited-d.debited desc,d.day desc limit 1),
   'alternative',(select jsonb_build_object('name',s.name,'image',s.image,'price',s.price,'url','/shop') from stock s where ws.failed_cost>0 and s.price>0 and s.price<=ws.failed_cost order by s.price desc,s.id,s.name limit 1)
  ))) into result from periods p join totals t on t.key=p.key join word_stats ws on ws.key=p.key;
 return result;
end $$;
revoke all on function public.rewards_player_economy(uuid) from public,anon,authenticated;
grant execute on function public.rewards_player_economy(uuid) to service_role;
