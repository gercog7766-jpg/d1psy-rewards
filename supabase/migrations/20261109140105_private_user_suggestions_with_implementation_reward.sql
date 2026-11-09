create table public.rewards_suggestions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.rewards_users(id),request_id uuid not null,
 title text not null check(char_length(title) between 5 and 100),description text not null check(char_length(description) between 20 and 3000),
 status text not null default 'new' check(status in('new','review','planned','implemented','rejected')),
 admin_note text not null default '' check(char_length(admin_note)<=1000),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 reward_transaction_id uuid unique references public.rewards_coin_transactions(id),unique(user_id,request_id),
 check((status='implemented')=(reward_transaction_id is not null))
);
alter table public.rewards_suggestions enable row level security;
revoke all on public.rewards_suggestions from public,anon,authenticated;
grant select,insert,update on public.rewards_suggestions to service_role;
create index rewards_suggestions_user_date on public.rewards_suggestions(user_id,created_at desc);
create index rewards_suggestions_date on public.rewards_suggestions(created_at desc,id);
create function public.rewards_suggestions_command(p_actor text,p_action text,p_body jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
declare u public.rewards_users; s public.rewards_suggestions; admin boolean;rows jsonb;pg integer;tx uuid;t text;d text;rid uuid;st text;begin
 select exists(select 1 from public.rewards_admins where twitch_user_id=p_actor) into admin;
 if p_action in('adminList','update') and not admin then raise exception 'admin_required';end if;
 if p_action in('submit','mine') then select * into u from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false) for update;if not found then raise exception 'user_required';end if;end if;
 if p_action='submit' then
  rid:=(p_body->>'requestId')::uuid;select * into s from public.rewards_suggestions where user_id=u.id and request_id=rid;if found then return to_jsonb(s);end if;
  t:=trim(p_body->>'title');d:=trim(p_body->>'description');
  if rid is null or t is null or d is null or char_length(t) not between 5 and 100 or char_length(d) not between 20 and 3000 then raise exception 'invalid_suggestion';end if;
  if (select count(*) from public.rewards_suggestions where user_id=u.id and created_at>now()-interval '24 hours')>=3 then raise exception 'daily_limit';end if;
  if exists(select 1 from public.rewards_suggestions where user_id=u.id and lower(title)=lower(t) and description=d) then raise exception 'duplicate_suggestion';end if;
  insert into public.rewards_suggestions(user_id,request_id,title,description) values(u.id,rid,t,d) returning * into s;return to_jsonb(s);
 elsif p_action in('mine','adminList') then
  pg:=coalesce((p_body->>'page')::integer,0);if pg<0 or pg>100000 then raise exception 'invalid_page';end if;
  select coalesce(jsonb_agg(x order by x.created_at desc,x.id),'[]') into rows from(select sg.*,author.twitch_login,author.twitch_display_name from public.rewards_suggestions sg join public.rewards_users author on author.id=sg.user_id where p_action='adminList' or author.twitch_user_id=p_actor order by sg.created_at desc,sg.id limit 20 offset pg*20)x;
  return jsonb_build_object('items',rows,'page',pg);
 elsif p_action='update' then
  select * into s from public.rewards_suggestions where id=(p_body->>'id')::uuid for update;if not found then raise exception 'suggestion_not_found';end if;
  st:=p_body->>'status';if st is null or st not in('new','review','planned','implemented','rejected') or char_length(coalesce(p_body->>'note',''))>1000 then raise exception 'invalid_status';end if;
  if s.status='implemented' and st<>'implemented' then raise exception 'already_rewarded';end if;
  tx:=s.reward_transaction_id;
  if st='implemented' and tx is null then
   insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(s.user_id,250,'adjustment','Реализованное предложение · '||s.title) returning id into tx;
  end if;
  update public.rewards_suggestions set status=st,admin_note=coalesce(p_body->>'note',''),reward_transaction_id=tx,updated_at=now() where id=s.id returning * into s;
  insert into public.rewards_audit_log(action,entity_type,entity_id,details) values('suggestion_updated','rewards_suggestions',s.id::text,jsonb_build_object('actor',p_actor,'status',st,'reward_transaction_id',tx));
  return to_jsonb(s);
 else raise exception 'invalid_action';end if;
end$$;
revoke all on function public.rewards_suggestions_command(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_suggestions_command(text,text,jsonb) to service_role;
