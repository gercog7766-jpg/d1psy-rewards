create table public.rewards_major_pickem_stages (
  stage smallint primary key check (stage between 1 and 4),
  label text not null,
  open_at timestamptz,
  lock_at timestamptz,
  first_match_at timestamptz,
  check (open_at is null or (lock_at is not null and open_at < lock_at)),
  check (lock_at is null or (first_match_at is not null and lock_at < first_match_at))
);
create table public.rewards_major_pickem_teams (
  stage smallint not null references public.rewards_major_pickem_stages(stage),
  team text not null,
  name text not null,
  logo text not null,
  primary key(stage,team)
);
create table public.rewards_major_pickem_pairs (
  stage smallint not null,
  slot smallint not null check (slot between 1 and 8),
  team_a text not null,
  team_b text not null check (team_b <> team_a),
  starts_at timestamptz not null,
  primary key(stage,slot),
  foreign key(stage,team_a) references public.rewards_major_pickem_teams(stage,team),
  foreign key(stage,team_b) references public.rewards_major_pickem_teams(stage,team)
);
create table public.rewards_major_pickem_entries (
  user_id uuid primary key references public.rewards_users(id),
  paid integer not null check (paid=250),
  entered_at timestamptz not null default clock_timestamp(),
  tokens integer not null default 0 check (tokens>=0),
  medal smallint not null default 0 check (medal between 0 and 4)
);
create table public.rewards_major_pickem_picks (
  stage smallint not null references public.rewards_major_pickem_stages(stage),
  user_id uuid not null references public.rewards_major_pickem_entries(user_id),
  selections jsonb not null check (jsonb_typeof(selections)='object'),
  saved_at timestamptz not null default clock_timestamp(),
  primary key(stage,user_id)
);

alter table public.rewards_major_pickem_stages enable row level security;
alter table public.rewards_major_pickem_teams enable row level security;
alter table public.rewards_major_pickem_pairs enable row level security;
alter table public.rewards_major_pickem_entries enable row level security;
alter table public.rewards_major_pickem_picks enable row level security;
revoke all on public.rewards_major_pickem_stages,public.rewards_major_pickem_teams,public.rewards_major_pickem_pairs,public.rewards_major_pickem_entries,public.rewards_major_pickem_picks from public,anon,authenticated;
grant select on public.rewards_major_pickem_stages,public.rewards_major_pickem_teams,public.rewards_major_pickem_pairs to service_role;
grant update on public.rewards_major_pickem_stages to service_role;
grant select,insert,update on public.rewards_major_pickem_entries,public.rewards_major_pickem_picks to service_role;

insert into public.rewards_major_pickem_stages(stage,label,open_at,lock_at,first_match_at) values
 (1,'Stage 1','2026-11-15 00:00:00+00','2026-11-24 03:45:00+00','2026-11-24 04:00:00+00'),
 (2,'Stage 2',null,null,null),(3,'Stage 3',null,null,null),(4,'Плей-офф',null,null,null);

insert into public.rewards_major_pickem_teams(stage,team,name,logo) values
 (1,'heroic','HEROIC','https://upload.wikimedia.org/wikipedia/commons/8/8f/Heroic_2023_logo.png'),
 (1,'imperial','Imperial','https://upload.wikimedia.org/wikipedia/commons/d/dd/Imperial_Esports.png'),
 (1,'9z','9z','https://liquipedia.net/commons/images/6/62/9z_Team_allmode.png'),
 (1,'lynn-vision','Lynn Vision','https://liquipedia.net/commons/images/b/b5/Lynn_Vision_Gaming_2024_full_allmode.png'),
 (1,'nip','Ninjas in Pyjamas','https://assets.blast.tv/images/teams/66510de7-c546-4695-bda2-300afc4a7d5f?width=120&format=auto'),
 (1,'m80','M80','https://liquipedia.net/commons/images/thumb/5/55/M80_2023_allmode.png/600px-M80_2023_allmode.png'),
 (1,'100t','100 Thieves','https://thumb.wikimedia.org/wikipedia/commons/thumb/1/16/100_Thieves_logo.svg/1280px-100_Thieves_logo.svg.png'),
 (1,'chinggis','Chinggis Warriors','https://owcdn.net/img/65fbd0bbbd4db.png'),
 (1,'liquid','Liquid','https://static.wikia.nocookie.net/dota2_gamepedia/images/4/45/Team_logo_Team_Liquid.png/revision/latest?cb=20210521174314'),
 (1,'bcgame','BC.Game','https://images.seeklogo.com/logo-png/61/2/bc-game-esports-logo-png_seeklogo-619973.png'),
 (1,'parivision','PARIVISION','https://images.cybersport.ru/images/details-logo/plain/21/21323333-bc1b-430f-95b0-951cf19ddf09.png'),
 (1,'dendele','DENDELE','https://liquipedia.net/commons/images/thumb/8/87/DENDELE_CS_allmode.png/600px-DENDELE_CS_allmode.png'),
 (1,'faze','FaZe','https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4d/Faze_Clan.svg/1280px-Faze_Clan.svg.png'),
 (1,'wildcard','Wildcard','https://liquipedia.net/commons/images/thumb/b/b3/Wildcard_2024_lightmode.png/170px-Wildcard_2024_lightmode.png'),
 (1,'eternal-fire','Eternal Fire','https://liquipedia.net/commons/images/thumb/e/ec/Eternal_Fire_2023_allmode.png/600px-Eternal_Fire_2023_allmode.png'),
 (1,'flyquest','FlyQuest','https://upload.wikimedia.org/wikipedia/commons/c/c1/Flyquest_logo_2021.svg');
insert into public.rewards_major_pickem_pairs(stage,slot,team_a,team_b,starts_at) values
 (1,1,'heroic','imperial','2026-11-24 04:00:00+00'),
 (1,2,'9z','lynn-vision','2026-11-24 04:00:00+00'),
 (1,3,'nip','m80','2026-11-24 05:00:00+00'),
 (1,4,'100t','chinggis','2026-11-24 05:00:00+00'),
 (1,5,'liquid','bcgame','2026-11-24 06:00:00+00'),
 (1,6,'parivision','dendele','2026-11-24 06:00:00+00'),
 (1,7,'faze','wildcard','2026-11-24 07:00:00+00'),
 (1,8,'eternal-fire','flyquest','2026-11-24 07:00:00+00');

create function public.rewards_major_pickem(p_actor text,p_action text,p_stage integer default null,p_selections jsonb default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
  player public.rewards_users;
  entry public.rewards_major_pickem_entries;
  chosen_stage public.rewards_major_pickem_stages;
  now_at timestamptz;
  can_enter boolean;
  allowed boolean;
  balance bigint;
  record_counts jsonb;
begin
  if p_action is null or p_action not in ('state','enter','save') then raise exception 'invalid_request'; end if;
  if p_action='state' then
    select * into player from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false);
  else
    select * into player from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false) for update;
  end if;
  if not found then raise exception 'user_unavailable'; end if;
  allowed := not coalesce(player.participation_restricted,false);
  if p_action<>'state' and not allowed then raise exception 'user_unavailable'; end if;
  now_at := clock_timestamp();
  select * into entry from public.rewards_major_pickem_entries where user_id=player.id;
  can_enter := exists(select 1 from public.rewards_major_pickem_stages where open_at<=now_at and now_at<lock_at);
  select coalesce(sum(amount),0) into balance from public.rewards_coin_transactions where user_id=player.id;

  if p_action='enter' and entry.user_id is null then
    if not can_enter then raise exception 'entry_closed'; end if;
    if balance<250 then raise exception 'insufficient_coins'; end if;
    insert into public.rewards_major_pickem_entries(user_id,paid) values(player.id,250) returning * into entry;
    insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
      values(player.id,-250,'adjustment','Major Pick’em Singapore 2026 · вход');
    balance := balance-250;
  elsif p_action='save' then
    if entry.user_id is null then raise exception 'entry_required'; end if;
    select * into chosen_stage from public.rewards_major_pickem_stages where stage=p_stage for share;
    now_at := clock_timestamp();
    if chosen_stage.stage is null or chosen_stage.stage=4 or chosen_stage.open_at is null
      or now_at<chosen_stage.open_at or now_at>=chosen_stage.lock_at then raise exception 'stage_locked'; end if;
    if p_selections is null or jsonb_typeof(p_selections)<>'object' then raise exception 'invalid_picks'; end if;
    if (select count(*) from public.rewards_major_pickem_teams where stage=p_stage)<>16
      or (select count(*) from jsonb_each_text(p_selections))<>16
      or exists(select 1 from jsonb_each_text(p_selections) s
        where s.value is null or not exists (select 1 from public.rewards_major_pickem_teams t where t.stage=p_stage and t.team=s.key))
      then raise exception 'invalid_picks'; end if;
    select jsonb_object_agg(outcome,quantity) into record_counts from (
      select value as outcome,count(*) as quantity from jsonb_each_text(p_selections) group by value
    ) grouped;
    if record_counts is distinct from '{"3:0":2,"3:1":3,"3:2":3,"1:3":3,"2:3":3,"0:3":2}'::jsonb then
      raise exception 'invalid_picks';
    end if;
    insert into public.rewards_major_pickem_picks(stage,user_id,selections,saved_at)
      values(p_stage,player.id,p_selections,now_at)
      on conflict(stage,user_id) do update set selections=excluded.selections,saved_at=excluded.saved_at;
  end if;
  return jsonb_build_object('now',now_at,'balance',balance,'eligible',allowed,'canEnter',can_enter,
    'entered',entry.user_id is not null,'tokens',coalesce(entry.tokens,0),'medal',coalesce(entry.medal,0),
    'stages',(select jsonb_agg(jsonb_build_object(
      'id',s.stage,'label',s.label,'lockAt',s.lock_at,'startsAt',s.first_match_at,
      'status',case when s.open_at is null then 'upcoming' when now_at>=s.lock_at then 'locked' when now_at>=s.open_at then 'open' else 'upcoming' end,
      'teams',(select coalesce(jsonb_agg(jsonb_build_object('id',t.team,'name',t.name,'logo',t.logo) order by t.name),'[]'::jsonb)
        from public.rewards_major_pickem_teams t where t.stage=s.stage),
      'pairs',(select coalesce(jsonb_agg(jsonb_build_object('a',p.team_a,'b',p.team_b,'at',p.starts_at) order by p.slot),'[]'::jsonb)
        from public.rewards_major_pickem_pairs p where p.stage=s.stage),
      'picks',mine.selections,'savedAt',mine.saved_at) order by s.stage)
      from public.rewards_major_pickem_stages s left join public.rewards_major_pickem_picks mine on mine.stage=s.stage and mine.user_id=player.id));
end;
$$;
revoke all on function public.rewards_major_pickem(text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.rewards_major_pickem(text,text,integer,jsonb) to service_role;
