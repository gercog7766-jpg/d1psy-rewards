-- A single JSON object in/out avoids the array/scalar RPC transport path.
-- Each existing, validated presence operation keeps its own savepoint.
create function public.rewards_primary_presence_record(p_sample jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare channel text; stamp timestamptz; active boolean; viewers text[]; result jsonb:='{}'::jsonb;
begin
 if p_sample is null or jsonb_typeof(p_sample)<>'object' or jsonb_typeof(p_sample->'viewers') is distinct from 'array' or jsonb_typeof(p_sample->'active') is distinct from 'boolean' or jsonb_array_length(p_sample->'viewers')>50000 then raise exception 'invalid_sample';end if;
 channel:=p_sample->>'broadcaster';stamp:=(p_sample->>'at')::timestamptz;active:=(p_sample->>'active')::boolean;
 if channel is null or channel!~'^[0-9]{1,30}$' or stamp is null or abs(extract(epoch from stamp-clock_timestamp()))>90 then raise exception 'invalid_sample';end if;
 if not exists(select 1 from public.rewards_streamers where twitch_broadcaster_id=channel and is_primary and enabled) then raise exception 'primary_required';end if;
 if exists(select 1 from jsonb_array_elements(p_sample->'viewers') e(value) where jsonb_typeof(e.value)<>'string' or e.value#>>'{}' !~ '^[0-9]{1,30}$') then raise exception 'invalid_viewers';end if;
 viewers:=array(select distinct v from jsonb_array_elements_text(p_sample->'viewers') e(v) where v<>channel);
 if not active then viewers:=array[]::text[];end if;
 begin
  perform public.rewards_boss_presence_sample(channel,stamp,active,viewers);
  result:=result||jsonb_build_object('boss',jsonb_build_object('ok',true));
 exception when others then result:=result||jsonb_build_object('boss',jsonb_build_object('ok',false,'code',sqlstate,'message',left(sqlerrm,300)));end;
 begin
  perform public.rewards_live_boost_sample(channel,stamp,active,viewers);
  result:=result||jsonb_build_object('boost',jsonb_build_object('ok',true));
 exception when others then result:=result||jsonb_build_object('boost',jsonb_build_object('ok',false,'code',sqlstate,'message',left(sqlerrm,300)));end;
 if active then
  begin
   perform public.rewards_live_time_achievement(channel,viewers,stamp);
   result:=result||jsonb_build_object('achievement',jsonb_build_object('ok',true));
  exception when others then result:=result||jsonb_build_object('achievement',jsonb_build_object('ok',false,'code',sqlstate,'message',left(sqlerrm,300)));end;
 end if;
 return result;
end$$;
revoke all on function public.rewards_primary_presence_record(jsonb) from public,anon,authenticated;
grant execute on function public.rewards_primary_presence_record(jsonb) to service_role;
notify pgrst,'reload schema';
