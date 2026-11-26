-- Closed PLUS features. No existing clan reward, wallet or regular statistics is changed.
create function public.rewards_stars_plus_access(p_actor text) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.rewards_users u where u.twitch_user_id=p_actor and not coalesce(u.banned,false) and public.rewards_stars_gift_tier(u.id)='plus');
$$;
revoke all on function public.rewards_stars_plus_access(text) from public,anon,authenticated;
grant execute on function public.rewards_stars_plus_access(text) to service_role;

create index if not exists rewards_stars_stats_transactions_user_date_idx on public.rewards_coin_transactions(user_id,created_at);
create function public.rewards_stars_plus_statistics(p_actor text,p_days integer) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare me uuid; today date:=(statement_timestamp() at time zone 'Europe/Moscow')::date; first_day date; lo timestamptz; hi timestamptz; result jsonb;
begin
 if p_days is null or p_days not in(7,30,90) then raise exception 'invalid_period';end if;
 select id into me from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false);
 if me is null or not public.rewards_stars_plus_access(p_actor) then raise exception 'plus_required';end if;
 first_day:=today-p_days+1;lo:=first_day::timestamp at time zone 'Europe/Moscow';hi:=(today+1)::timestamp at time zone 'Europe/Moscow';
 with tx as materialized(select (created_at at time zone 'Europe/Moscow')::date as day,amount,case when note like 'LIVE REWARDS ·%' or note like 'LIVE STREAK ·%' then 'live' when note like 'NIGHT RUN%' then 'night-run' else transaction_type::text end as category from public.rewards_coin_transactions where user_id=me and created_at>=lo and created_at<hi),
 daily as(select day,coalesce(sum(amount) filter(where amount>0),0) credited,coalesce(-sum(amount) filter(where amount<0),0) debited,count(*) operations from tx group by day),
 categories as(select category,coalesce(sum(amount) filter(where amount>0),0) credited,coalesce(-sum(amount) filter(where amount<0),0) debited,count(*) operations from tx group by category),
 live as(select broadcaster,sum(seconds) seconds,sum(messages) messages,sum(time_coins) time_coins,sum(chat_coins) chat_coins,sum(streak_coins) streak_coins from public.rewards_live_economy_daily where user_id=me and day between first_day and today group by broadcaster)
 select jsonb_build_object('from',first_day,'through',today,'days',p_days,
 'totals',(select jsonb_build_object('credited',coalesce(sum(credited),0),'debited',coalesce(sum(debited),0),'net',coalesce(sum(credited-debited),0),'operations',coalesce(sum(operations),0),'activeDays',count(*)) from daily),
 'daily',(select coalesce(jsonb_agg(jsonb_build_object('day',d.day,'credited',coalesce(v.credited,0),'debited',coalesce(v.debited,0),'operations',coalesce(v.operations,0)) order by d.day),'[]'::jsonb) from (select first_day+i as day from generate_series(0,p_days-1)i)d left join daily v on v.day=d.day),
 'categories',(select coalesce(jsonb_agg(to_jsonb(c) order by c.credited+c.debited desc,c.category),'[]'::jsonb) from categories c),
 'live',(select coalesce(jsonb_agg(jsonb_build_object('channel',coalesce((select twitch_login from public.rewards_users where twitch_user_id=l.broadcaster limit 1),l.broadcaster),'seconds',l.seconds,'messages',l.messages,'timeCoins',l.time_coins,'chatCoins',l.chat_coins,'streakCoins',l.streak_coins) order by l.seconds desc,l.broadcaster),'[]'::jsonb) from live l)) into result;
 return result;
end $$;
revoke all on function public.rewards_stars_plus_statistics(text,integer) from public,anon,authenticated;
grant execute on function public.rewards_stars_plus_statistics(text,integer) to service_role;

create table public.rewards_stars_clan_appearance(
 clan_id uuid primary key references public.rewards_clans(id) on delete cascade,
 theme text check(theme in('aurora','royal','nebula')),
 updated_at timestamptz not null default now()
);
alter table public.rewards_stars_clan_appearance enable row level security;
revoke all on public.rewards_stars_clan_appearance from public,anon,authenticated;
grant select,insert,update on public.rewards_stars_clan_appearance to service_role;

create function public.rewards_stars_clan_style(p_actor text,p_clan uuid,p_action text default 'state',p_theme text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare me uuid; owner uuid; active boolean; chosen text;
begin
 select u.id into me from public.rewards_users u join public.rewards_admins a on a.twitch_user_id=u.twitch_user_id where u.twitch_user_id=p_actor and not coalesce(u.banned,false);
 if me is null then if p_action='state' then return null;end if;raise exception 'admin_required';end if;
 if p_action='save' then select owner_id into owner from public.rewards_clans where id=p_clan for update;
 elsif p_action='state' then select owner_id into owner from public.rewards_clans where id=p_clan;
 else raise exception 'invalid_request';end if;
 if owner is null then raise exception 'not_found';end if;
 active:=public.rewards_stars_gift_tier(owner)='plus';
 if p_action='save' then
  if owner<>me then raise exception 'leader_required';end if;
  if not active then raise exception 'plus_required';end if;
  if p_theme is not null and p_theme not in('aurora','royal','nebula') then raise exception 'invalid_theme';end if;
  insert into public.rewards_stars_clan_appearance(clan_id,theme) values(p_clan,p_theme) on conflict(clan_id) do update set theme=excluded.theme,updated_at=now();
 end if;
 if active then select theme into chosen from public.rewards_stars_clan_appearance where clan_id=p_clan;end if;
 return jsonb_build_object('theme',chosen,'canEdit',owner=me and active);
end $$;
revoke all on function public.rewards_stars_clan_style(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.rewards_stars_clan_style(text,uuid,text,text) to service_role;
notify pgrst,'reload schema';
