create or replace function public.rewards_s1_seed_daily_schedule()
returns void language plpgsql security invoker set search_path='' as $$
declare d date; k text; h bigint; i integer; j integer; tmp text; a text[]; t text; tv integer; rv integer;
begin
 -- Never rewrite tasks for a day that has already begun.
 d:=greatest(date '2026-11-07',(now() at time zone 'Europe/Moscow')::date+1);
 while d<=date '2026-12-12' loop
  delete from public.rewards_season_daily_schedule where day=d;
  if d=date '2026-11-07' then
   insert into public.rewards_season_daily_schedule(day,task_key,target,reward) values
    (d,'ttt_win',1,150),(d,'wordly_win',1,150),(d,'minesweeper_play',1,150);
  else
   k:=to_char(d,'YYYY-MM-DD');h:=0;
   for i in 1..length(k) loop h:=mod(h*31+ascii(substr(k,i,1)),4294967296);end loop;
   a:=array['drop_win','daily_bonus','upgrades_2','shop_buy','xp_100','withdraw_30','upgrade_win','ttt_win','wordly_win','checkers_play','black_box_bid','minesweeper_play','defuse_play'];
   if extract(isodow from d)=7 then a:=array_remove(a,'drop_win');end if;
   i:=cardinality(a);
   while i>1 loop h:=mod(h*1664525+1013904223,4294967296);j:=mod(h,i)::integer+1;tmp:=a[i];a[i]:=a[j];a[j]:=tmp;i:=i-1;end loop;
   for i in 1..3 loop
    t:=a[i];tv:=case t when 'upgrades_2' then 2 when 'xp_100' then 100 else 1 end;
    rv:=case t when 'drop_win' then 100 when 'daily_bonus' then 100 when 'upgrade_win' then 200 else 150 end;
    insert into public.rewards_season_daily_schedule(day,task_key,target,reward) values(d,t,tv,rv);
   end loop;
  end if;
  d:=d+1;
 end loop;
end; $$;
revoke all on function public.rewards_s1_seed_daily_schedule() from public,anon,authenticated;
grant execute on function public.rewards_s1_seed_daily_schedule() to service_role;

-- Replace only unavailable prediction slots. Keep the other daily missions,
-- historical progress and awarded SP. Prefer a game not already on that day.
do $$
declare
  slot record;
  replacement text;
begin
  for slot in
    select day from public.rewards_season_daily_schedule
    where day >= (clock_timestamp() at time zone 'Europe/Moscow')::date
      and task_key = 'predict_winner'
    order by day
    for update
  loop
    select candidate into replacement
    from unnest(array['minesweeper_play','defuse_play','checkers_play','wordly_win','ttt_win'])
      with ordinality as choices(candidate, priority)
    where not exists (
      select 1 from public.rewards_season_daily_schedule existing
      where existing.day = slot.day and existing.task_key = candidate
    )
    order by priority limit 1;
    if replacement is null then
      raise exception 'No available replacement for %', slot.day;
    end if;
    update public.rewards_season_daily_schedule
      set task_key = replacement, target = 1
      where day = slot.day and task_key = 'predict_winner';
  end loop;
end;
$$;
