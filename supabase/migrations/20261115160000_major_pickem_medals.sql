alter table public.rewards_major_pickem_entries
  drop constraint rewards_major_pickem_entries_medal_check,
  alter column medal set default 1;
update public.rewards_major_pickem_entries set medal=1 where medal=0;
alter table public.rewards_major_pickem_entries
  add constraint rewards_major_pickem_entries_medal_check check (medal between 1 and 5);

create table public.rewards_major_pickem_results (
  stage smallint primary key references public.rewards_major_pickem_stages(stage),
  results jsonb not null,
  settled_at timestamptz not null default clock_timestamp()
);
alter table public.rewards_major_pickem_results enable row level security;
revoke all on public.rewards_major_pickem_results from public,anon,authenticated,service_role;

create function public.rewards_major_pickem_settle(p_stage integer,p_results jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  deadline timestamptz;
  recorded jsonb;
  record_counts jsonb;
begin
  -- Each settlement updates the same entry rows, so settle stages serially.
  perform pg_advisory_xact_lock(hashtextextended('rewards_major_pickem_settle',0));
  select lock_at into deadline from public.rewards_major_pickem_stages where stage=p_stage for update;
  if deadline is null or clock_timestamp()<deadline then raise exception 'stage_unavailable'; end if;

  select results into recorded from public.rewards_major_pickem_results where stage=p_stage;
  if found then
    if recorded is distinct from p_results then raise exception 'stage_already_settled'; end if;
    return false;
  end if;
  if p_results is null or jsonb_typeof(p_results)<>'object' then raise exception 'invalid_results'; end if;

  if p_stage<=3 then
    if exists (
      select from jsonb_each_text(p_results) r
      where not exists (select from public.rewards_major_pickem_teams t where t.stage=p_stage and t.team=r.key)
    ) then raise exception 'invalid_results'; end if;
    select jsonb_object_agg(outcome,n) into record_counts from (
      select value as outcome,count(*) as n from jsonb_each_text(p_results) group by value
    ) counts where outcome is not null;
    if record_counts is distinct from '{"3:0":2,"3:1":3,"3:2":3,"1:3":3,"2:3":3,"0:3":2}'::jsonb
      or (select count(*) from jsonb_each_text(p_results))<>16 then raise exception 'invalid_results'; end if;
  else
    if (select array_agg(key order by key collate "C") from jsonb_each_text(p_results))
        is distinct from array['final','qf-1','qf-2','qf-3','qf-4','sf-1','sf-2']
      or exists (
        select from jsonb_each_text(p_results) r
        where not exists (select from public.rewards_major_pickem_teams t where t.stage=4 and t.team=r.value)
      )
      or (select count(distinct value) from jsonb_each_text(p_results) where key like 'qf-%')<>4
      or p_results->>'sf-1' not in (p_results->>'qf-1',p_results->>'qf-2')
      or p_results->>'sf-2' not in (p_results->>'qf-3',p_results->>'qf-4')
      or p_results->>'final' not in (p_results->>'sf-1',p_results->>'sf-2')
      then raise exception 'invalid_results'; end if;
  end if;

  insert into public.rewards_major_pickem_results(stage,results) values(p_stage,p_results);

  with scored as (
    select p.user_id,
      count(*) filter(where r.value=p.selections->>r.key) as exact_hits,
      case when p_stage<=3 then count(*) filter(where
        r.value=p.selections->>r.key
        or (r.value in ('3:1','3:2') and p.selections->>r.key in ('3:1','3:2'))
        or (r.value in ('1:3','2:3') and p.selections->>r.key in ('1:3','2:3'))
      )>=6
      else count(*) filter(where r.key like 'qf-%' and r.value=p.selections->>r.key)>=2
        and count(*) filter(where r.key like 'sf-%' and r.value=p.selections->>r.key)>=1
        and bool_or(r.key='final' and r.value=p.selections->>r.key)
      end as passed
    from public.rewards_major_pickem_picks p cross join jsonb_each_text(p_results) r
    where p.stage=p_stage and p.saved_at<deadline
    group by p.user_id
  )
  update public.rewards_major_pickem_entries e
    set tokens=e.tokens+s.exact_hits, medal=e.medal+case when s.passed then 1 else 0 end
    from scored s where e.user_id=s.user_id;
  return true;
end;
$$;
revoke all on function public.rewards_major_pickem_settle(integer,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_major_pickem_settle(integer,jsonb) to service_role;
