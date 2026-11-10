-- Permanent personal cosmetics. Streamer wallets, XP and official roles are independent.
create table public.rewards_profile_catalog (
 id text primary key, kind text not null check(kind in('frame','background')),
 name text not null, tier text not null,
 price integer not null,
 check ((kind='frame' and ((tier='simple' and price=5) or (tier='rare' and price=15) or (tier='animated' and price=50))) or (kind='background' and tier='background' and price=25))
);
insert into public.rewards_profile_catalog values
 ('silver','frame','Серебряный контур','simple',5),('violet','frame','Лиловый контур','simple',5),
 ('gold','frame','Золотая орбита','rare',15),('crystal','frame','Ледяной кристалл','rare',15),
 ('aurora','frame','Северное сияние','animated',50),('pulse','frame','Неоновый пульс','animated',50),
 ('nebula','background','Туманность','background',25),('midnight','background','Полночь','background',25),('sunset','background','Закат','background',25);
create table public.rewards_profile_owned (
 user_id uuid not null references public.rewards_users(id) on delete cascade,
 item_id text not null references public.rewards_profile_catalog(id),
 request_id uuid not null, transaction_id uuid not null references public.rewards_coin_transactions(id),
 purchased_at timestamptz not null default now(), primary key(user_id,item_id),unique(user_id,request_id)
);
create index rewards_profile_owned_item_idx on public.rewards_profile_owned(item_id);
create index rewards_profile_owned_transaction_idx on public.rewards_profile_owned(transaction_id);
create table public.rewards_profile_style (
 user_id uuid primary key references public.rewards_users(id) on delete cascade,
 bio text not null default '' check(char_length(bio)<=240),
 frame text references public.rewards_profile_catalog(id),background text references public.rewards_profile_catalog(id),
 title text check(char_length(title) between 1 and 40),title_visible boolean not null default true,
 updated_at timestamptz not null default now()
);
create index rewards_profile_style_frame_idx on public.rewards_profile_style(frame);
create index rewards_profile_style_background_idx on public.rewards_profile_style(background);
create table public.rewards_profile_title_audit (
 id bigint generated always as identity primary key,actor text not null,
 user_id uuid not null references public.rewards_users(id) on delete cascade,
 title text,created_at timestamptz not null default now()
);
create index rewards_profile_title_audit_user_idx on public.rewards_profile_title_audit(user_id,created_at desc);
alter table public.rewards_profile_catalog enable row level security;
alter table public.rewards_profile_owned enable row level security;
alter table public.rewards_profile_style enable row level security;
alter table public.rewards_profile_title_audit enable row level security;
revoke all on public.rewards_profile_catalog,public.rewards_profile_owned,public.rewards_profile_style,public.rewards_profile_title_audit from public,anon,authenticated;
grant select on public.rewards_profile_catalog to service_role;
grant select,insert on public.rewards_profile_owned,public.rewards_profile_title_audit to service_role;
grant select,insert,update on public.rewards_profile_style to service_role;
grant usage,select on sequence public.rewards_profile_title_audit_id_seq to service_role;

create function public.rewards_profile_customization(p_actor text,p_action text,p_body jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare me public.rewards_users; item public.rewards_profile_catalog; owned public.rewards_profile_owned;
 balance bigint; tx uuid; target uuid; title_text text; query text; actual_page integer; total integer; result jsonb;
begin
 if jsonb_typeof(p_body) is distinct from 'object' then raise exception 'invalid_request';end if;
 if p_action in('titles','grant','revoke') then
  if not exists(select 1 from public.rewards_streamers where is_primary and twitch_broadcaster_id=p_actor) then raise exception 'owner_required';end if;
  if p_action='titles' then
   query:=lower(left(coalesce(p_body->>'query',''),60));
   select count(*) into total from public.rewards_users where not coalesce(banned,false) and position(query in lower(twitch_login||' '||coalesce(twitch_display_name,'')))>0;
   actual_page:=least(greatest(coalesce((p_body->>'page')::integer,1),1),greatest(1,ceil(total/20.0)::integer));
   select coalesce(jsonb_agg(to_jsonb(x) order by lower(x.login),x.id),'[]'::jsonb) into result from (
    select u.id,u.twitch_login as login,coalesce(nullif(u.twitch_display_name,''),u.twitch_login) as name,s.title from public.rewards_users u left join public.rewards_profile_style s on s.user_id=u.id
    where not coalesce(u.banned,false) and position(query in lower(u.twitch_login||' '||coalesce(u.twitch_display_name,'')))>0
    order by lower(u.twitch_login),u.id limit 20 offset (actual_page-1)*20)x;
   return jsonb_build_object('users',result,'page',actual_page,'pages',greatest(1,ceil(total/20.0)::integer),'total',total);
  end if;
  target:=(p_body->>'userId')::uuid;
  perform 1 from public.rewards_users where id=target and not coalesce(banned,false) for update;
  if not found then raise exception 'user_unavailable';end if;
  title_text:=case when p_action='grant' then trim(p_body->>'title') else null end;
  if p_action='grant' and (title_text is null or char_length(title_text) not between 1 and 40 or title_text ~ '[[:cntrl:]]' or lower(title_text) ~ '(стример|streamer|админ|admin|модератор|moderator|основатель|founder|партн[её]р|partner)') then raise exception 'invalid_title';end if;
  insert into public.rewards_profile_style(user_id,title) values(target,title_text) on conflict(user_id) do update set title=excluded.title,title_visible=true,updated_at=now();
  insert into public.rewards_profile_title_audit(actor,user_id,title) values(p_actor,target,title_text);
  return jsonb_build_object('ok',true);
 end if;
 -- All personal wallet debits use the same user row lock as games and gifts.
 select * into me from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false) for update;
 if not found then raise exception 'user_unavailable';end if;
 if p_action='buy' then
  if p_body->>'requestId' is null then raise exception 'invalid_request';end if;
  select * into owned from public.rewards_profile_owned where user_id=me.id and request_id=(p_body->>'requestId')::uuid;
  if found and owned.item_id is distinct from p_body->>'itemId' then raise exception 'request_conflict';end if;
  select * into item from public.rewards_profile_catalog where id=p_body->>'itemId';
  if not found then raise exception 'invalid_item';end if;
  if not exists(select 1 from public.rewards_profile_owned where user_id=me.id and item_id=item.id) then
   select coalesce(sum(amount),0) into balance from public.rewards_coin_transactions where user_id=me.id;
   if balance<item.price then raise exception 'insufficient_coins';end if;
   insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note) values(me.id,-item.price,'shop_purchase','Оформление профиля · '||item.name) returning id into tx;
   insert into public.rewards_profile_owned(user_id,item_id,request_id,transaction_id) values(me.id,item.id,(p_body->>'requestId')::uuid,tx);
  end if;
 elsif p_action='save' then
  if jsonb_typeof(p_body->'bio') is distinct from 'string' or char_length(p_body->>'bio')>240 or jsonb_typeof(p_body->'titleVisible') is distinct from 'boolean' then raise exception 'invalid_request';end if;
  if exists(select 1 from (values('frame'),('background')) as k(kind) where nullif(p_body->>k.kind,'') is not null and not exists(select 1 from public.rewards_profile_owned o join public.rewards_profile_catalog c on c.id=o.item_id where o.user_id=me.id and c.id=p_body->>k.kind and c.kind=k.kind)) then raise exception 'item_not_owned';end if;
  insert into public.rewards_profile_style(user_id,bio,frame,background,title_visible) values(me.id,trim(p_body->>'bio'),nullif(p_body->>'frame',''),nullif(p_body->>'background',''),(p_body->>'titleVisible')::boolean)
  on conflict(user_id) do update set bio=excluded.bio,frame=excluded.frame,background=excluded.background,title_visible=excluded.title_visible,updated_at=now();
 elsif p_action<>'state' then raise exception 'invalid_action';
 end if;
 return jsonb_build_object('login',me.twitch_login,'name',coalesce(nullif(me.twitch_display_name,''),me.twitch_login),'avatar',me.twitch_avatar_url,
 'balance',(select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=me.id),
 'catalog',(select jsonb_agg(jsonb_build_object('id',c.id,'kind',c.kind,'name',c.name,'tier',c.tier,'price',c.price,'owned',exists(select 1 from public.rewards_profile_owned o where o.user_id=me.id and o.item_id=c.id)) order by c.price,c.id) from public.rewards_profile_catalog c),
 'style',coalesce((select jsonb_build_object('bio',s.bio,'frame',s.frame,'background',s.background,'title',s.title,'titleVisible',s.title_visible) from public.rewards_profile_style s where s.user_id=me.id),jsonb_build_object('bio','','frame',null,'background',null,'title',null,'titleVisible',true)));
end $$;
create function public.rewards_profile_styles(p_logins text[])
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('login',u.twitch_login,'bio',s.bio,'frame',s.frame,'background',s.background,'title',case when s.title_visible then s.title end)),'[]'::jsonb)
 from public.rewards_users u join public.rewards_profile_style s on s.user_id=u.id where u.twitch_login=any(p_logins) and not coalesce(u.banned,false) and array_length(p_logins,1)<=24;
$$;
revoke all on function public.rewards_profile_customization(text,text,jsonb),public.rewards_profile_styles(text[]) from public,anon,authenticated;
grant execute on function public.rewards_profile_customization(text,text,jsonb),public.rewards_profile_styles(text[]) to service_role;
