create table public.rewards_blind_rounds (
 id uuid primary key default gen_random_uuid(),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 closed_at timestamptz,
 status text not null default 'open' check(status in ('open','won','no_winner','cancelled')),
 low_number integer not null check(low_number between 0 and 9999),
 high_number integer not null check(high_number between 0 and 9999),
 entry_fee integer not null check(entry_fee between 0 and 1000000),
 prize_id uuid not null references public.rewards_prizes(id),
 winner_id uuid references public.rewards_users(id),
 winning_number integer,
 check(high_number-low_number between 1 and 499),
 check(ends_at>starts_at)
);
create unique index rewards_blind_one_open on public.rewards_blind_rounds ((1)) where status='open';
create table public.rewards_blind_entries (
 round_id uuid not null references public.rewards_blind_rounds(id),
 user_id uuid not null references public.rewards_users(id),
 number integer,
 primary key(round_id,user_id)
);
alter table public.rewards_blind_rounds enable row level security;
alter table public.rewards_blind_entries enable row level security;
revoke all on public.rewards_blind_rounds,public.rewards_blind_entries from public,anon,authenticated;
grant select,insert,update on public.rewards_blind_rounds,public.rewards_blind_entries to service_role;

create function public.rewards_blind_finish(p_cancel uuid default null) returns void
language plpgsql security invoker set search_path='' as $$
declare game public.rewards_blind_rounds%rowtype; winning integer; recipient uuid; outcome text;
begin
 select * into game from public.rewards_blind_rounds
 where status='open' and (ends_at<=clock_timestamp() or id=p_cancel) for update;
 if not found then return; end if;
 if p_cancel=game.id and game.ends_at>clock_timestamp() then
  outcome:='cancelled';
 else
  outcome:='no_winner';
  if (select count(number) from public.rewards_blind_entries where round_id=game.id)>=3 then
   select min(candidate.number) into winning from (
    select e.number from public.rewards_blind_entries e
    where e.round_id=game.id and e.number is not null group by e.number having count(*)=1
   ) candidate;
   if winning is not null then
    select e.user_id into recipient from public.rewards_blind_entries e where e.round_id=game.id and e.number=winning;
    outcome:='won';
   end if;
  end if;
 end if;
 if game.entry_fee>0 then
  perform 1 from public.rewards_users u where u.id in (
   select e.user_id from public.rewards_blind_entries e where e.round_id=game.id and (outcome<>'won' or e.number is null)
  ) order by u.id for update;
  insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
  select e.user_id,game.entry_fee,'adjustment','Слепой финал · возврат · '||game.id
  from public.rewards_blind_entries e where e.round_id=game.id and (outcome<>'won' or e.number is null);
 end if;
 if recipient is not null then
  insert into public.rewards_wins(user_id,prize_id,source_type,delivery_status,choice_status)
  values(recipient,game.prize_id,'blind_final','awaiting_choice','awaiting_choice');
 end if;
 update public.rewards_blind_rounds set status=outcome,closed_at=clock_timestamp(),winner_id=recipient,winning_number=winning where id=game.id;
end;
$$;

create function public.rewards_blind_start(p_prize uuid,p_minutes integer,p_low integer,p_high integer,p_fee integer) returns uuid
language plpgsql security invoker set search_path='' as $$
declare reserved uuid; round_key uuid; started timestamptz;
begin
 if p_minutes is null or p_minutes not between 1 and 10080 then raise exception 'invalid_request'; end if;
 perform public.rewards_blind_finish();
 if exists(select 1 from public.rewards_blind_rounds where status='open') then raise exception 'round_active'; end if;
 insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
 select name,image_url,'disabled',true,1,sell_price_coins from public.rewards_prizes where id=p_prize
 returning id into reserved;
 if reserved is null then raise exception 'unknown_prize'; end if;
 started:=clock_timestamp();
 insert into public.rewards_blind_rounds(starts_at,ends_at,low_number,high_number,entry_fee,prize_id)
 values(started,started+make_interval(mins=>p_minutes),p_low,p_high,p_fee,reserved) returning id into round_key;
 return round_key;
end;
$$;

create function public.rewards_blind_play(p_round uuid,p_user uuid,p_number integer) returns void
language plpgsql security invoker set search_path='' as $$
declare game public.rewards_blind_rounds%rowtype; entry public.rewards_blind_entries%rowtype;
begin
 select * into game from public.rewards_blind_rounds where id=p_round for update;
 if not found or game.status<>'open' or game.ends_at<=clock_timestamp() then raise exception 'round_closed'; end if;
 perform 1 from public.rewards_users where id=p_user and not banned and not participation_restricted for update;
 if not found then raise exception 'participation_restricted'; end if;
 if game.ends_at<=clock_timestamp() then raise exception 'round_closed'; end if;
 select * into entry from public.rewards_blind_entries where round_id=p_round and user_id=p_user;
 if p_number is null then
  if found then return; end if;
  if game.entry_fee>0 then
   if (select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=p_user)<game.entry_fee then raise exception 'insufficient_coins'; end if;
   insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
   values(p_user,-game.entry_fee,'adjustment','Слепой финал · участие · '||game.id);
  end if;
  insert into public.rewards_blind_entries(round_id,user_id) values(p_round,p_user);
 else
  if not found then raise exception 'entry_required'; end if;
  if p_number not between game.low_number and game.high_number then raise exception 'invalid_request'; end if;
  if entry.number=p_number then return; end if;
  if entry.number is not null then raise exception 'number_locked'; end if;
  update public.rewards_blind_entries set number=p_number where round_id=p_round and user_id=p_user;
 end if;
end;
$$;

create function public.rewards_blind_state(p_user uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare current_game jsonb; previous_games jsonb; latest jsonb;
begin
 perform public.rewards_blind_finish();
 select jsonb_build_object('id',r.id,'endsAt',r.ends_at,'low',r.low_number,'high',r.high_number,'fee',r.entry_fee,
  'skin',p.name,'image',p.image_url,'joined',e.user_id is not null,'number',e.number,
  'participants',(select count(*) from public.rewards_blind_entries a where a.round_id=r.id))
 into current_game from public.rewards_blind_rounds r join public.rewards_prizes p on p.id=r.prize_id
 left join public.rewards_blind_entries e on e.round_id=r.id and e.user_id=p_user where r.status='open';
 select coalesce(jsonb_agg(jsonb_build_object('name',coalesce(u.twitch_display_name,u.twitch_login),'skin',p.name) order by r.closed_at desc),'[]')
 into previous_games from (select * from public.rewards_blind_rounds where status='won' order by closed_at desc limit 15) r
 join public.rewards_users u on u.id=r.winner_id join public.rewards_prizes p on p.id=r.prize_id;
 select jsonb_build_object('id',r.id,'status',r.status,'name',coalesce(u.twitch_display_name,u.twitch_login),'skin',p.name,
  'low',r.low_number,'high',r.high_number,'winning',r.winning_number,'counts',
  coalesce((select jsonb_object_agg(c.number,c.total) from (
   select e.number,count(*) as total from public.rewards_blind_entries e where e.round_id=r.id and e.number is not null group by e.number
  ) c),'{}')) into latest from public.rewards_blind_rounds r left join public.rewards_users u on u.id=r.winner_id
 join public.rewards_prizes p on p.id=r.prize_id where r.status<>'open' order by r.closed_at desc limit 1;
 return jsonb_build_object('current',current_game,'previous',previous_games,'latest',latest,'now',clock_timestamp());
end;
$$;
revoke all on function public.rewards_blind_finish(uuid),public.rewards_blind_start(uuid,integer,integer,integer,integer),
 public.rewards_blind_play(uuid,uuid,integer),public.rewards_blind_state(uuid) from public,anon,authenticated;
grant execute on function public.rewards_blind_finish(uuid),public.rewards_blind_start(uuid,integer,integer,integer,integer),
 public.rewards_blind_play(uuid,uuid,integer),public.rewards_blind_state(uuid) to service_role;
