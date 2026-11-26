-- Closed setup only; the season and payment switch remain off.
alter table public.rewards_s2_live_config add column setup_revision integer not null default 0 check(setup_revision>=0),add column draft_revision integer;
grant insert(season,starts_at,ends_at),update(starts_at,ends_at) on public.rewards_stars_seasons to service_role;
grant insert(season,setup_revision,draft_revision),update(setup_revision,draft_revision) on public.rewards_s2_live_config to service_role;
grant insert,update(kind,label,value,prize_id,wear,variant_kind) on public.rewards_s2_live_rewards to service_role;

create function public.rewards_s2_setup_freeze_dates() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at) and exists(select 1 from public.rewards_s2_live_config where season=old.season) and (exists(select 1 from public.rewards_s2_live_config where season=old.season and enabled) or exists(select 1 from public.rewards_s2_live_profiles where season=old.season) or exists(select 1 from public.rewards_stars_pilot_orders where season=old.season and product='battlePass' and state in('approved','paid','refunded'))) then raise exception 'season_catalog_frozen';end if;
 return new;
end $$;
revoke all on function public.rewards_s2_setup_freeze_dates() from public,anon,authenticated;
grant execute on function public.rewards_s2_setup_freeze_dates() to service_role;
create trigger rewards_s2_setup_freeze_dates before update of starts_at,ends_at on public.rewards_stars_seasons for each row execute function public.rewards_s2_setup_freeze_dates();

create function public.rewards_s2_skin_allowed(p_level int,p_track text,p_budget int,p_price int,p_name text) returns boolean
language sql immutable security invoker set search_path='' as $$
 select coalesce(case when p_level=50 and p_track='free' then p_price between 500 and 600 and lower(p_name)!~'^(наклейка|sticker|капсула|capsule|кейс|case |брелок|charm|агент|agent|ключ|key |граффити|graffiti|музыкальный набор|music kit|патч|patch)' when p_level=50 and p_track='premium' then p_price between 2200 and 2800 and lower(p_name)~'(перчатки|обмотки рук|gloves|hand wraps)' else p_price between greatest(2,floor(p_budget*0.7)::int) and p_budget end,false);
$$;
revoke all on function public.rewards_s2_skin_allowed(int,text,int,int,text) from public,anon,authenticated;
grant execute on function public.rewards_s2_skin_allowed(int,text,int,int,text) to service_role;

create function public.rewards_s2_setup_candidates(p_actor text,p_slots jsonb,p_query text default '') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.rewards_users u join public.rewards_admins a using(twitch_user_id) where u.twitch_user_id=p_actor and not coalesce(u.banned,false)) then raise exception 'admin_required';end if;
 if jsonb_typeof(p_slots) is distinct from 'array' or jsonb_array_length(p_slots)>100 or p_query is null or length(p_query)>100 then raise exception 'invalid_request';end if;
 if exists(select 1 from jsonb_to_recordset(p_slots) as s(level int,track text,budget int) where s.level is null or s.level not between 1 and 50 or s.track is null or s.track not in('free','premium') or s.budget is null or s.budget not between 2 and 3000) then raise exception 'invalid_request';end if;
 select coalesce(jsonb_agg(jsonb_build_object('level',s.level,'track',s.track,'items',coalesce(c.items,'[]'::jsonb)) order by s.level,s.track),'[]'::jsonb) into result
 from jsonb_to_recordset(p_slots) as s(level int,track text,budget int)
 cross join lateral(select jsonb_agg(to_jsonb(x) order by abs(x.price-s.budget),x.item_id,x.variant_id) items from (select p.item_id,p.variant_id,p.name,p.price,p.wear,p.kind from public.rewards_drop_shop_pool p where p.price between case when s.level=50 and s.track='free' then 500 when s.level=50 then 2200 else greatest(2,floor(s.budget*0.7)::int) end and case when s.level=50 and s.track='free' then 600 when s.level=50 then 2800 else s.budget end and public.rewards_s2_skin_allowed(s.level,s.track,s.budget,p.price,p.name) and (p_query='' or strpos(lower(p.name),lower(p_query))>0) order by abs(p.price-s.budget),p.item_id,p.variant_id limit 12)x)c;
 return result;
end $$;
revoke all on function public.rewards_s2_setup_candidates(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.rewards_s2_setup_candidates(text,jsonb,text) to service_role;

create function public.rewards_s2_setup_save(p_actor text,p_season text,p_start date,p_revision int,p_draft_revision int,p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.rewards_s2_live_config; draft public.rewards_monetization_draft; x record; chosen record; prize uuid; label_text text; final_value int; wear_text text; kind_text text; start_at timestamptz; selected int:=0; total_skins int:=0; next_revision int; saved boolean; old_plan jsonb; expected jsonb;
begin
 if not exists(select 1 from public.rewards_users u join public.rewards_admins a using(twitch_user_id) where u.twitch_user_id=p_actor and not coalesce(u.banned,false)) then raise exception 'admin_required';end if;
 if p_season is null or length(p_season) not between 1 and 80 or p_start is null or p_start<(clock_timestamp() at time zone 'Europe/Moscow')::date or p_start>(clock_timestamp() at time zone 'Europe/Moscow')::date+365 or p_revision is null or p_revision< -1 or p_draft_revision is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)<>100 then raise exception 'invalid_request';end if;
 perform pg_advisory_xact_lock(hashtextextended('s2-setup:'||p_season,0));
 select * into draft from public.rewards_monetization_draft where id for share;
 if not found or draft.revision<>p_draft_revision then raise exception 'draft_conflict';end if;
 if draft.config?'battlePass' and (draft.config->'battlePass'->>'season' is distinct from p_season or (draft.config->'battlePass'->>'days')::int<>90) then raise exception 'draft_conflict';end if;
 old_plan:=draft.config->'battlePass'->'levels';
 select * into cfg from public.rewards_s2_live_config where season=p_season for update;saved:=found;
 if (case when saved then cfg.setup_revision else -1 end)<>p_revision then raise exception 'setup_conflict';end if;
 if coalesce(cfg.enabled,false) or exists(select 1 from public.rewards_s2_live_profiles where season=p_season) or exists(select 1 from public.rewards_stars_pilot_orders where season=p_season and product='battlePass' and state in('approved','paid','refunded')) then raise exception 'season_catalog_frozen';end if;
 if (select count(distinct (r.level,r.track)) from jsonb_to_recordset(p_rows) as r(level int,track text))<>100 then raise exception 'invalid_request';end if;
 if exists(select 1 from jsonb_to_recordset(p_rows) as r(level int,track text,kind text,label text,budget int,item_id uuid,variant_id uuid,expected_price int) where r.level is null or r.level not between 1 and 50 or r.track is null or r.track not in('free','premium') or r.kind is null or r.kind not in('coins','skin','title','frame','background','badge') or r.label is null or length(r.label) not between 1 and 120 or r.budget is null or not ((r.kind='coins' and r.budget between 1 and 5000) or (r.kind='skin' and r.budget between 2 and 3000) or (r.kind in('title','frame','background','badge') and r.budget=0)) or (r.kind<>'skin' and (r.item_id is not null or r.variant_id is not null)) or (r.item_id is null and (r.variant_id is not null or r.expected_price is not null)) or (r.item_id is not null and (r.expected_price is null or r.expected_price not between 2 and 3000))) then raise exception 'invalid_request';end if;
 if not exists(select 1 from jsonb_to_recordset(p_rows) as r(level int,track text,kind text,budget int) where r.level=50 and r.track='free' and r.kind='skin' and r.budget between 500 and 600) or not exists(select 1 from jsonb_to_recordset(p_rows) as r(level int,track text,kind text,budget int) where r.level=50 and r.track='premium' and r.kind='skin' and r.budget between 2200 and 2800) then raise exception 'invalid_final_reward';end if;
 start_at:=p_start::timestamp at time zone 'Europe/Moscow';next_revision:=p_revision+1;
 insert into public.rewards_stars_seasons(season,starts_at,ends_at) values(p_season,start_at,start_at+interval '2160 hours') on conflict(season) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at;
 insert into public.rewards_s2_live_config(season,setup_revision,draft_revision) values(p_season,next_revision,p_draft_revision) on conflict(season) do update set setup_revision=excluded.setup_revision,draft_revision=excluded.draft_revision;
 for x in select * from jsonb_to_recordset(p_rows) as r(level int,track text,kind text,label text,budget int,item_id uuid,variant_id uuid,expected_price int) order by level,track loop
  -- Saved, non-placeholder drafts remain authoritative.
  if jsonb_typeof(old_plan)='array' and exists(select 1 from jsonb_array_elements(old_plan) r where r->'free'->>'kind'<>'none' or r->'premium'->>'kind'<>'none') then
   expected:=old_plan->(x.level-1)->x.track;if expected->>'kind' is distinct from x.kind or expected->>'label' is distinct from x.label or (expected->>'value')::int is distinct from x.budget then raise exception 'draft_conflict';end if;
  end if;
  prize:=null;wear_text:=null;kind_text:=null;label_text:=x.label;final_value:=x.budget;
  if x.kind='skin' then
   total_skins:=total_skins+1;
   if x.item_id is not null then
    select * into chosen from public.rewards_drop_shop_pool where item_id=x.item_id and variant_id is not distinct from x.variant_id;
    if not found or not public.rewards_s2_skin_allowed(x.level,x.track,x.budget,chosen.price,chosen.name) then raise exception 'skin_outside_budget';end if;if chosen.price<>x.expected_price then raise exception 'skin_price_changed';end if;
    label_text:=case chosen.kind when 'stattrak' then 'StatTrak™ ' when 'souvenir' then 'Сувенирный ' else '' end||chosen.name||case when chosen.wear is not null then ' · '||chosen.wear else '' end;final_value:=chosen.price;wear_text:=chosen.wear;kind_text:=chosen.kind;
    insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins,drop_shop_item_id,drop_shop_variant_id,drop_wear,drop_kind) values(label_text,chosen.image_url,'disabled',true,1,chosen.price,chosen.item_id,chosen.variant_id,chosen.wear,chosen.kind) on conflict(drop_shop_item_id,drop_shop_variant_id,sell_price_coins) where drop_shop_item_id is not null do nothing returning id into prize;
    if prize is null then select id into prize from public.rewards_prizes where drop_shop_item_id=chosen.item_id and drop_shop_variant_id is not distinct from chosen.variant_id and sell_price_coins=chosen.price and unlimited and drop_wear is not distinct from chosen.wear and drop_kind is not distinct from chosen.kind;end if;
    if prize is null then raise exception 'skin_snapshot_unavailable';end if;selected:=selected+1;
   end if;
  end if;
  insert into public.rewards_s2_live_rewards(season,level,track,kind,label,value,prize_id,wear,variant_kind) values(p_season,x.level,x.track,x.kind,left(label_text,120),final_value,prize,wear_text,kind_text) on conflict(season,level,track) do update set kind=excluded.kind,label=excluded.label,value=excluded.value,prize_id=excluded.prize_id,wear=excluded.wear,variant_kind=excluded.variant_kind;
 end loop;
 return jsonb_build_object('revision',next_revision,'selected',selected,'skinSlots',total_skins,'complete',selected=total_skins,'enabled',false,'startsAt',start_at,'endsAt',start_at+interval '2160 hours');
end $$;
revoke all on function public.rewards_s2_setup_save(text,text,date,int,int,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_s2_setup_save(text,text,date,int,int,jsonb) to service_role;
notify pgrst,'reload schema';
