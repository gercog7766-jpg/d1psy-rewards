create table public.rewards_achievement_notifications(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.rewards_users(id),
 category text not null check(category in ('messages','seconds','bosses')),
 tier int not null check(tier between 1 and 4),
 earned_at timestamptz not null default now(),
 seen_at timestamptz,
 unique(user_id,category,tier)
);
create index rewards_achievement_unseen on public.rewards_achievement_notifications(user_id,earned_at) where seen_at is null;
alter table public.rewards_achievement_notifications enable row level security;
revoke all on public.rewards_achievement_notifications from public,anon,authenticated;
grant select,insert,update on public.rewards_achievement_notifications to service_role;

create function public.rewards_achievement_thresholds(p_category text) returns bigint[]
language sql immutable set search_path='' as $$
 select case p_category when 'messages' then array[100,500,2000,5000]::bigint[]
 when 'seconds' then array[18000,54000,180000,360000]::bigint[]
 when 'bosses' then array[1,5,15,50]::bigint[] else array[]::bigint[] end
$$;
create function public.rewards_achievement_notify() returns trigger
language plpgsql set search_path='' as $$
declare c text; current_value bigint; previous_value bigint; thresholds bigint[]; i int;
begin
 foreach c in array array['messages','seconds','bosses'] loop
  current_value:=case c when 'messages' then new.messages when 'seconds' then new.seconds else new.bosses end;
  previous_value:=0;
  if tg_op='UPDATE' then previous_value:=case c when 'messages' then old.messages when 'seconds' then old.seconds else old.bosses end;end if;
  if current_value<=previous_value then continue;end if;
  thresholds:=public.rewards_achievement_thresholds(c);
  for i in 1..4 loop
   if previous_value<thresholds[i] and current_value>=thresholds[i] then
    insert into public.rewards_achievement_notifications(user_id,category,tier) values(new.user_id,c,i)
    on conflict(user_id,category,tier) do nothing;
   end if;
  end loop;
 end loop;
 return new;
end$$;
create trigger rewards_achievement_progress_notice after insert or update of messages,seconds,bosses
on public.rewards_live_achievement_progress for each row execute function public.rewards_achievement_notify();
-- Preserve existing progress; announce the highest already attained rank only.
insert into public.rewards_achievement_notifications(user_id,category,tier)
select p.user_id,v.category,r.tier
from public.rewards_live_achievement_progress p
cross join lateral (values('messages',p.messages),('seconds',p.seconds),('bosses',p.bosses)) v(category,amount)
cross join lateral (select max(t.i)::int tier from unnest(public.rewards_achievement_thresholds(v.category)) with ordinality t(n,i) where v.amount>=t.n) r
where r.tier is not null on conflict(user_id,category,tier) do nothing;
revoke all on function public.rewards_achievement_thresholds(text),public.rewards_achievement_notify() from public,anon,authenticated;
grant execute on function public.rewards_achievement_thresholds(text),public.rewards_achievement_notify() to service_role;
notify pgrst,'reload schema';
