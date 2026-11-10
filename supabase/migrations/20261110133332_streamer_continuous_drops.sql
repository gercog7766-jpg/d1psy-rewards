create table public.rewards_streamer_live_series(
 broadcaster_id text primary key references public.rewards_streamer_live_profiles(broadcaster_id),
 enabled boolean not null default false,request_id uuid not null,actor text not null,
 mode text not null check(mode in('time','messages')),seconds integer not null check(seconds between 1 and 3600),
 threshold integer not null check(threshold between 5 and 5000),min_price integer not null check(min_price>=2),max_price integer not null check(max_price between min_price and 3000),
 stopped_reason text,updated_at timestamptz not null default clock_timestamp()
);
alter table public.rewards_streamer_live_series enable row level security;
revoke all on public.rewards_streamer_live_series from public,anon,authenticated;
grant select,insert,update on public.rewards_streamer_live_series to service_role;
create function public.rewards_streamer_live_series_command(p_actor text,p_broadcaster text,p_action text,p_body jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.rewards_streamer_live_series; r public.rewards_streamer_live_rounds; result jsonb;
begin
 if p_actor is distinct from p_broadcaster and not exists(select 1 from public.rewards_streamers where is_primary and twitch_broadcaster_id=p_actor) then raise exception 'owner_required';end if;
 if exists(select 1 from public.rewards_streamers where is_primary and twitch_broadcaster_id=p_broadcaster) then raise exception 'invalid_request';end if;
 if p_action is null or p_action not in('state','start','stop') or jsonb_typeof(p_body) is distinct from 'object' then raise exception 'invalid_request';end if;
 perform 1 from public.rewards_streamer_live_control where id for share;
 perform 1 from public.rewards_streamer_live_profiles where broadcaster_id=p_broadcaster and status='approved' for update;
 if not found then raise exception 'approval_required';end if;
 select * into s from public.rewards_streamer_live_series where broadcaster_id=p_broadcaster for update;
 if p_action='state' then return jsonb_build_object('series',to_jsonb(s));end if;
 if p_action='stop' then
  update public.rewards_streamer_live_series set enabled=false,stopped_reason='manual',updated_at=clock_timestamp() where broadcaster_id=p_broadcaster;
  for r in select * from public.rewards_streamer_live_rounds where broadcaster_id=p_broadcaster and status='active' for update loop perform public.rewards_streamer_live_finish(r.id,true);end loop;
 else
  if s.request_id=(p_body->>'requestId')::uuid then
   if s.mode is distinct from p_body->>'mode' or s.seconds is distinct from (p_body->>'seconds')::integer or s.threshold is distinct from (p_body->>'threshold')::integer or s.min_price is distinct from (p_body->>'minPrice')::integer or s.max_price is distinct from (p_body->>'maxPrice')::integer then raise exception 'request_conflict';end if;
   return jsonb_build_object('ok',true,'series',to_jsonb(s));
  end if;
  if s.enabled then raise exception 'series_active';end if;
  result:=public.rewards_streamer_live_api(p_broadcaster,'start',p_body);
  -- A nonce already used for an old one-off round must never start an endless series.
  if not exists(select 1 from public.rewards_streamer_live_rounds where id=(p_body->>'requestId')::uuid and broadcaster_id=p_broadcaster and status='active') then raise exception 'request_conflict';end if;
  insert into public.rewards_streamer_live_series(broadcaster_id,enabled,request_id,actor,mode,seconds,threshold,min_price,max_price)
  values(p_broadcaster,true,(p_body->>'requestId')::uuid,p_actor,p_body->>'mode',(p_body->>'seconds')::integer,(p_body->>'threshold')::integer,(p_body->>'minPrice')::integer,(p_body->>'maxPrice')::integer)
  on conflict(broadcaster_id) do update set enabled=true,request_id=excluded.request_id,actor=excluded.actor,mode=excluded.mode,seconds=excluded.seconds,threshold=excluded.threshold,min_price=excluded.min_price,max_price=excluded.max_price,stopped_reason=null,updated_at=clock_timestamp();
  update public.rewards_streamer_live_ledger set actor=p_actor where broadcaster_id=p_broadcaster and request_id=(p_body->>'requestId')::uuid and kind='reserve';
 end if;
 insert into public.rewards_streamer_live_audit(actor,action,target) values(p_actor,'series:'||p_action,p_broadcaster);
 return jsonb_build_object('ok',true,'series',(select to_jsonb(x) from public.rewards_streamer_live_series x where broadcaster_id=p_broadcaster));
end $$;
create function public.rewards_streamer_live_series_tick(p_broadcaster text) returns void language plpgsql security invoker set search_path='' as $$
declare s public.rewards_streamer_live_series; rid uuid; result jsonb;
begin
 perform 1 from public.rewards_streamer_live_control where id and enabled for share;if not found then return;end if;
 perform 1 from public.rewards_streamer_live_profiles where broadcaster_id=p_broadcaster and status='approved' for update;if not found then return;end if;
 select * into s from public.rewards_streamer_live_series where broadcaster_id=p_broadcaster and enabled for update;if not found then return;end if;
 if exists(select 1 from public.rewards_streamer_live_rounds where broadcaster_id=p_broadcaster and status='active') then return;end if;
 if exists(select 1 from public.rewards_streamer_live_rounds where broadcaster_id=p_broadcaster and finished_at>clock_timestamp()-interval '12 seconds') then return;end if;
 rid:=gen_random_uuid();
 begin
  result:=public.rewards_streamer_live_api(p_broadcaster,'start',jsonb_build_object('requestId',rid,'mode',s.mode,'seconds',s.seconds,'threshold',s.threshold,'minPrice',s.min_price,'maxPrice',s.max_price));
  update public.rewards_streamer_live_ledger set actor=s.actor where broadcaster_id=p_broadcaster and request_id=rid and kind='reserve';
 exception when raise_exception then
  if sqlerrm not in('no_affordable_prize','insufficient_budget','pilot_disabled','approval_required') then raise;end if;
  update public.rewards_streamer_live_series set enabled=false,stopped_reason=sqlerrm,updated_at=clock_timestamp() where broadcaster_id=p_broadcaster;
 end;
end $$;
-- Every stop path disables renewal: dashboard stop, owner stop, suspension and global switch.
create function public.rewards_streamer_live_stop_series() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='rewards_streamer_live_control' then
  if not new.enabled then update public.rewards_streamer_live_series set enabled=false,stopped_reason='pilot_disabled',updated_at=clock_timestamp() where enabled;end if;
 elsif tg_table_name='rewards_streamer_live_profiles' then
  if new.status<>'approved' then update public.rewards_streamer_live_series set enabled=false,stopped_reason='approval_required',updated_at=clock_timestamp() where broadcaster_id=new.broadcaster_id and enabled;end if;
 else
  if new.status='cancelled' then update public.rewards_streamer_live_series set enabled=false,stopped_reason='manual',updated_at=clock_timestamp() where broadcaster_id=new.broadcaster_id and enabled;end if;
 end if;return new;
end $$;
create trigger rewards_streamer_live_series_switch after update of enabled on public.rewards_streamer_live_control for each row execute function public.rewards_streamer_live_stop_series();
create trigger rewards_streamer_live_series_profile after update of status on public.rewards_streamer_live_profiles for each row execute function public.rewards_streamer_live_stop_series();
create trigger rewards_streamer_live_series_round after update of status on public.rewards_streamer_live_rounds for each row when(new.status='cancelled') execute function public.rewards_streamer_live_stop_series();
-- Public stream overlay DTO contains no wallet, token, user IDs or private cabinet data.
create function public.rewards_streamer_live_widget(p_login text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare target text;
begin
 select broadcaster_id into target from public.rewards_streamer_live_profiles where login=p_login and status='approved';if not found then raise exception 'profile_not_found';end if;
 return jsonb_build_object('channel',p_login,'serverNow',clock_timestamp(),'enabled',(select enabled from public.rewards_streamer_live_control where id),
 'series',(select enabled from public.rewards_streamer_live_series where broadcaster_id=target),
 'round',(select jsonb_build_object('id',id,'mode',mode,'seconds',seconds,'threshold',threshold,'message_count',message_count,'started_at',started_at,'prize_name',prize_name) from public.rewards_streamer_live_rounds where broadcaster_id=target and status='active'),
 'latest',(select jsonb_build_object('id',id,'winner',winner_name,'prize',prize_name,'image',(select z.image_url from public.rewards_prizes z where z.id=prize_id),'at',finished_at) from public.rewards_streamer_live_rounds where broadcaster_id=target and status='completed' order by finished_at desc limit 1));
end $$;
revoke all on function public.rewards_streamer_live_series_command(text,text,text,jsonb),public.rewards_streamer_live_series_tick(text),public.rewards_streamer_live_stop_series(),public.rewards_streamer_live_widget(text) from public,anon,authenticated;
grant execute on function public.rewards_streamer_live_series_command(text,text,text,jsonb),public.rewards_streamer_live_series_tick(text),public.rewards_streamer_live_stop_series(),public.rewards_streamer_live_widget(text) to service_role;
