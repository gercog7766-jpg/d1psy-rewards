create table public.rewards_market_catalog_batches(run_id uuid not null,batch_no integer not null check(batch_no>=0),batch_total integer not null check(batch_total between 1 and 1000),item_total integer not null check(item_total between 500 and 20000),items jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(run_id,batch_no));
alter table public.rewards_market_catalog_batches enable row level security;
revoke all on public.rewards_market_catalog_batches from public,anon,authenticated;
grant select,insert,delete on public.rewards_market_catalog_batches to service_role;
create function public.rewards_market_catalog_stage(p_run uuid,p_no integer,p_total integer,p_count integer,p_items jsonb) returns jsonb language plpgsql set search_path='' as $$
begin
 if p_run is null or p_total is null or p_total not between 1 and 1000 or p_no is null or p_no<0 or p_no>=p_total or p_count is null or p_count not between 500 and 20000 or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 or octet_length(p_items::text)>500000 then raise exception 'invalid_catalog_batch';end if;
 perform pg_advisory_xact_lock(78201932);
 if p_no=0 then delete from public.rewards_market_catalog_batches where created_at<clock_timestamp()-interval '1 day';end if;
 insert into public.rewards_market_catalog_batches(run_id,batch_no,batch_total,item_total,items) values(p_run,p_no,p_total,p_count,p_items) on conflict do nothing;
 if not exists(select 1 from public.rewards_market_catalog_batches where run_id=p_run and batch_no=p_no and batch_total=p_total and item_total=p_count and items=p_items) then raise exception 'catalog_batch_conflict';end if;
 return jsonb_build_object('ok',true);
end$$;
create function public.rewards_market_catalog_finish(p_run uuid) returns jsonb language plpgsql set search_path='' as $$
declare total integer; expected integer; actual integer; payload jsonb; result jsonb;
begin
 perform pg_advisory_xact_lock(78201932);
 select min(batch_total),min(item_total),count(*) into total,expected,actual from public.rewards_market_catalog_batches where run_id=p_run;
 if total is null or actual<>total or exists(select 1 from public.rewards_market_catalog_batches where run_id=p_run and (batch_total<>total or item_total<>expected or batch_no>=total)) then raise exception 'incomplete_catalog_batches';end if;
 select jsonb_agg(e.value order by b.batch_no,e.ord) into payload from public.rewards_market_catalog_batches b cross join lateral jsonb_array_elements(b.items) with ordinality e(value,ord) where b.run_id=p_run;
 if jsonb_array_length(payload)<>expected or (select count(distinct x->>'key') from jsonb_array_elements(payload) x)<>expected then raise exception 'incomplete_catalog_batches';end if;
 result:=public.rewards_market_catalog_apply(payload);
 delete from public.rewards_market_catalog_batches where run_id=p_run;
 return result;
end$$;
revoke all on function public.rewards_market_catalog_stage(uuid,integer,integer,integer,jsonb),public.rewards_market_catalog_finish(uuid) from public,anon,authenticated;
grant execute on function public.rewards_market_catalog_stage(uuid,integer,integer,integer,jsonb),public.rewards_market_catalog_finish(uuid) to service_role;
notify pgrst,'reload schema';
