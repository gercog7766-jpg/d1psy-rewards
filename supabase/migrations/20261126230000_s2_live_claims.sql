-- Actual S2 ledger. No season is opened or rewards issued by this migration.
create table public.rewards_s2_live_config(
 season text primary key references public.rewards_stars_seasons(season),enabled boolean not null default false
);
create unique index rewards_s2_one_enabled_season_idx on public.rewards_s2_live_config(enabled) where enabled;
create table public.rewards_s2_live_rewards(
 season text references public.rewards_s2_live_config(season),level integer check(level between 1 and 50),track text check(track in('free','premium')),
 kind text not null check(kind in('coins','skin','title','frame','background','badge')),label text not null check(length(label) between 1 and 120),value integer not null check(value between 0 and 500000),
 prize_id uuid references public.rewards_prizes(id),wear text check(wear in('FN','MW','FT','WW','BS')),variant_kind text check(variant_kind in('normal','stattrak','souvenir')),
 primary key(season,level,track),check((kind in('coins','skin') and value>0) or (kind not in('coins','skin') and value=0)),check(kind='skin' or (prize_id is null and wear is null and variant_kind is null))
);
create table public.rewards_s2_live_profiles(
 user_id uuid references public.rewards_users(id),season text references public.rewards_s2_live_config(season),revision int not null default 0 check(revision>=0),state jsonb not null check(jsonb_typeof(state)='object'),updated_at timestamptz not null default now(),primary key(user_id,season)
);
create index rewards_s2_live_profiles_updated_idx on public.rewards_s2_live_profiles(updated_at);
create table public.rewards_s2_live_claims(
 user_id uuid references public.rewards_users(id),season text,level int,track text,kind text not null,label text not null,value int not null,
 coin_transaction uuid unique references public.rewards_coin_transactions(id),win_id uuid unique references public.rewards_wins(id),created_at timestamptz not null default now(),
 primary key(user_id,season,level,track),foreign key(season,level,track) references public.rewards_s2_live_rewards(season,level,track),
 check((kind='coins' and coin_transaction is not null and win_id is null) or (kind='skin' and win_id is not null and coin_transaction is null) or (kind in('title','frame','background','badge') and coin_transaction is null and win_id is null))
);
alter table public.rewards_s2_live_config enable row level security;
alter table public.rewards_s2_live_rewards enable row level security;
alter table public.rewards_s2_live_profiles enable row level security;
alter table public.rewards_s2_live_claims enable row level security;
revoke all on public.rewards_s2_live_config,public.rewards_s2_live_rewards,public.rewards_s2_live_profiles,public.rewards_s2_live_claims from public,anon,authenticated;
grant select on public.rewards_s2_live_config,public.rewards_s2_live_rewards to service_role;
grant select,insert,update on public.rewards_s2_live_profiles to service_role;
grant select,insert on public.rewards_s2_live_claims to service_role;

-- Once an actual season is started or paid for, its advertised prizes cannot change.
create function public.rewards_s2_live_freeze_catalog() returns trigger language plpgsql security invoker set search_path='' as $$
declare key text:=case when tg_op='DELETE' then old.season else new.season end;
begin
 if tg_op='UPDATE' and old.season<>new.season then raise exception 'season_catalog_frozen';end if;
 if exists(select 1 from public.rewards_s2_live_config where season=key and enabled) or exists(select 1 from public.rewards_s2_live_profiles where season=key) or exists(select 1 from public.rewards_stars_pilot_orders where season=key and product='battlePass' and state in('approved','paid','refunded')) then raise exception 'season_catalog_frozen';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.rewards_s2_live_freeze_catalog() from public,anon,authenticated;
grant execute on function public.rewards_s2_live_freeze_catalog() to service_role;
create trigger rewards_s2_live_freeze_catalog before insert or update or delete on public.rewards_s2_live_rewards for each row execute function public.rewards_s2_live_freeze_catalog();

create function public.rewards_s2_live_ready(p_season text) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.rewards_s2_live_config c join public.rewards_stars_seasons s using(season) where c.season=p_season and c.enabled and s.ends_at=s.starts_at+interval '2160 hours' and (s.starts_at at time zone 'Europe/Moscow')::time=time '00:00')
 and (select count(*) from public.rewards_s2_live_rewards where season=p_season)=100
 and not exists(select 1 from public.rewards_s2_live_rewards r left join public.rewards_prizes p on p.id=r.prize_id where r.season=p_season and r.kind='skin' and (p.id is null or not coalesce(p.unlimited,false)))
 and exists(select 1 from public.rewards_s2_live_rewards where season=p_season and level=50 and track='free' and kind='skin' and value between 500 and 600)
 and exists(select 1 from public.rewards_s2_live_rewards where season=p_season and level=50 and track='premium' and kind='skin' and value between 2200 and 2800);
$$;
revoke all on function public.rewards_s2_live_ready(text) from public,anon,authenticated;
grant execute on function public.rewards_s2_live_ready(text) to service_role;

-- No charge for a Battle Pass until the real season and every fixed reward are configured.
create function public.rewards_s2_live_checkout_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.product='battlePass' and old.state='pending' and new.state='approved' and not public.rewards_s2_live_ready(new.season) then raise exception 'season_not_ready';end if;
 return new;
end $$;
revoke all on function public.rewards_s2_live_checkout_guard() from public,anon,authenticated;
grant execute on function public.rewards_s2_live_checkout_guard() to service_role;
create trigger rewards_s2_live_checkout_guard before update of state on public.rewards_stars_pilot_orders for each row execute function public.rewards_s2_live_checkout_guard();

-- Recalculate from server-observed task masks, never from a requested level or SP.
create function public.rewards_s2_live_level(p_state jsonb) returns integer
language plpgsql immutable security invoker set search_path='' as $$
declare i int;j int;m int;n int;sp int:=0;daily int:=0;weekly int:=0;challenges int:=0;each_week boolean:=true;required int:=0;lv int:=0;
begin
 if jsonb_typeof(p_state) is distinct from 'object' then raise exception 'invalid_progress';end if;
 for i in 1..90 loop m:=coalesce((p_state->'days'->i::text->>'mask')::int,0);if m not between 0 and 7 then raise exception 'invalid_progress';end if;if m=7 then daily:=daily+1;end if;for j in 0..2 loop if (m & (1<<j))<>0 then sp:=sp+100+j*25;end if;end loop;end loop;
 for i in 1..13 loop m:=coalesce((p_state->'weeks'->i::text->>'mask')::int,0);if m not between 0 and 511 then raise exception 'invalid_progress';end if;n:=0;for j in 0..8 loop if (m & (1<<j))<>0 then n:=n+1;end if;end loop;weekly:=weekly+n;sp:=sp+n*600;each_week:=each_week and n>=8;end loop;
 for i in 0..2 loop m:=coalesce((p_state->'months'->i->>'mask')::int,0);if m not between 0 and 7 then raise exception 'invalid_progress';end if;for j in 0..2 loop if (m & (1<<j))<>0 then challenges:=challenges+1;sp:=sp+case j when 0 then 1500 when 1 then 2000 else 3000 end;end if;end loop;end loop;
 for i in 1..50 loop required:=required+case when i=50 then 4650 when i<=10 then 1000 when i<=20 then 1700 when i<=30 then 2400 when i<=40 then 3000 else 3800 end;if sp>=required then lv:=i;end if;end loop;
 if daily<>90 or weekly<111 or not each_week or challenges<>9 then lv:=least(lv,49);end if;return lv;
end $$;
revoke all on function public.rewards_s2_live_level(jsonb) from public,anon,authenticated;
grant execute on function public.rewards_s2_live_level(jsonb) to service_role;

create function public.rewards_s2_live_claim(p_actor text,p_season text,p_track text,p_level int) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare me uuid; s public.rewards_stars_seasons; p public.rewards_s2_live_profiles; r public.rewards_s2_live_rewards; receipt public.rewards_s2_live_claims; coin uuid; win uuid;
begin
 if p_track is null or p_track not in('free','premium') or p_level is null or p_level not between 1 and 50 then raise exception 'invalid_reward';end if;
 select u.id into me from public.rewards_users u join public.rewards_admins a on a.twitch_user_id=u.twitch_user_id where u.twitch_user_id=p_actor and not coalesce(u.banned,false) and (not coalesce(u.participation_restricted,false) or exists(select 1 from public.rewards_streamers st where st.is_primary and st.twitch_broadcaster_id=u.twitch_user_id)) for update of u;
 if me is null then raise exception 'admin_required';end if;
 select * into receipt from public.rewards_s2_live_claims where user_id=me and season=p_season and level=p_level and track=p_track;
 if found then return to_jsonb(receipt);end if;
 if not public.rewards_s2_live_ready(p_season) then raise exception 'season_not_ready';end if;
 select * into s from public.rewards_stars_seasons where season=p_season;
 if clock_timestamp()<s.starts_at or clock_timestamp()>=s.ends_at+interval '7 days' then raise exception 'season_finished';end if;
 select * into p from public.rewards_s2_live_profiles where user_id=me and season=p_season for update;
 if not found or p.state->>'season' is distinct from p_season or p.state->>'start' is distinct from (s.starts_at at time zone 'Europe/Moscow')::date::text or public.rewards_s2_live_level(p.state)<p_level then raise exception 'level_locked';end if;
 if p_level=50 and clock_timestamp()<s.ends_at-interval '24 hours' then raise exception 'level_locked';end if;
 if p_track='premium' then
  perform 1 from public.rewards_stars_pilot_orders where actor=p_actor and product='battlePass' and season=p_season and state='paid' and season_ends_at=s.ends_at and approved_at>=s.starts_at and approved_at<s.ends_at for share;
  if not found then raise exception 'premium_required';end if;
 end if;
 select * into r from public.rewards_s2_live_rewards where season=p_season and track=p_track and level=p_level;
 if not found then raise exception 'invalid_reward';end if;
 if r.kind='coins' then insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(me,r.value,'level_reward','Battle Pass S2 · '||p_track||' · LVL '||p_level) returning id into coin;
 elsif r.kind='skin' then
  perform 1 from public.rewards_prizes where id=r.prize_id and unlimited for share;if not found then raise exception 'season_prize_missing';end if;
  insert into public.rewards_wins(user_id,prize_id,source_type,item_wear,item_variant_kind) values(me,r.prize_id,'season',r.wear,r.variant_kind) returning id into win;
 end if;
 insert into public.rewards_s2_live_claims(user_id,season,level,track,kind,label,value,coin_transaction,win_id) values(me,p_season,p_level,p_track,r.kind,r.label,r.value,coin,win) returning * into receipt;
 return to_jsonb(receipt);
end $$;
revoke all on function public.rewards_s2_live_claim(text,text,text,integer) from public,anon,authenticated;
grant execute on function public.rewards_s2_live_claim(text,text,text,integer) to service_role;
notify pgrst,'reload schema';
