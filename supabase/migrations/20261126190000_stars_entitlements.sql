-- Paid rights are derived exclusively from verified real Stars receipts.
-- No test orders, wallet mutations, or public launch are introduced here.
create table public.rewards_stars_seasons(
 season text primary key check(length(season) between 1 and 80),
 starts_at timestamptz not null,ends_at timestamptz not null,
 check(ends_at>starts_at and ends_at<=starts_at+interval '90 days')
);
alter table public.rewards_stars_seasons enable row level security;
revoke all on public.rewards_stars_seasons from public,anon,authenticated;
grant select on public.rewards_stars_seasons to service_role;
alter table public.rewards_stars_pilot_orders add column season_ends_at timestamptz;

-- Freeze the advertised season end at approval. No season means no BP charge.
create function public.rewards_stars_freeze_season() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.product='battlePass' and old.state='pending' and new.state='approved' then
  select ends_at into new.season_ends_at from public.rewards_stars_seasons
   where season=new.season and starts_at<=clock_timestamp() and ends_at>clock_timestamp();
  if new.season_ends_at is null then raise exception 'season_not_open';end if;
 end if;
 return new;
end $$;
revoke all on function public.rewards_stars_freeze_season() from public,anon,authenticated;
grant execute on function public.rewards_stars_freeze_season() to service_role;
create trigger rewards_stars_freeze_season before update of state on public.rewards_stars_pilot_orders for each row execute function public.rewards_stars_freeze_season();

create index rewards_stars_active_receipts_idx on public.rewards_stars_pilot_orders(actor,paid_at,id) where state='paid';
create function public.rewards_stars_entitlements(p_actor text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare o record; lite_until timestamptz; plus_until timestamptz; stamp timestamptz:=statement_timestamp(); tier text:='free'; passes jsonb:='[]'::jsonb;
begin
 if p_actor is null or length(p_actor) not between 1 and 128 then raise exception 'invalid_actor';end if;
 for o in select product,paid_at,days,season,season_ends_at from public.rewards_stars_pilot_orders where actor=p_actor and state='paid' order by paid_at,id loop
  if o.product='lite' then lite_until:=greatest(o.paid_at,lite_until)+make_interval(secs=>o.days*86400);
  elsif o.product='plus' then plus_until:=greatest(o.paid_at,plus_until)+make_interval(secs=>o.days*86400);
  elsif o.product='battlePass' and o.season_ends_at>stamp then passes:=passes||jsonb_build_array(jsonb_build_object('season',o.season,'until',o.season_ends_at));end if;
 end loop;
 if plus_until>stamp then tier:='plus';elsif lite_until>stamp then tier:='lite';end if;
 return jsonb_build_object('tier',tier,'expiresAt',case tier when 'plus' then plus_until when 'lite' then lite_until else null end,
  'liteUntil',lite_until,'plusUntil',plus_until,'battlePasses',passes,'limits',jsonb_build_object('coins',case tier when 'plus' then 200 when 'lite' then 100 else 20 end,'skins',case tier when 'plus' then 300 when 'lite' then 150 else 30 end),
  'features',jsonb_build_object('profile',tier<>'free','animatedFrame',tier='plus','expandedStatistics',tier='plus','clanAppearance',tier='plus'));
end $$;
revoke all on function public.rewards_stars_entitlements(text) from public,anon,authenticated;
grant execute on function public.rewards_stars_entitlements(text) to service_role;
notify pgrst,'reload schema';
