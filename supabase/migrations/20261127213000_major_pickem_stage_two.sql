-- PGL Singapore Stage 2; opening schedule confirmed by HLTV on 27 November.
-- Settlement is idempotent and refuses a conflicting previously recorded result.
do $$
begin
 if exists(select 1 from public.rewards_major_pickem_picks where stage=2) then
  raise exception 'stage_two_already_has_predictions';
 end if;
end $$;
insert into public.rewards_major_pickem_teams(stage,team,name,logo)
 select 2,team,name,logo from public.rewards_major_pickem_teams
 where stage=1 and team in ('flyquest','nip','liquid','eternal-fire','parivision','imperial','lynn-vision','100t')
 on conflict(stage,team) do update set name=excluded.name,logo=excluded.logo;
insert into public.rewards_major_pickem_teams(stage,team,name,logo) values
 (2,'fut','FUT','https://liquipedia.net/commons/images/9/90/Futbolist_2021_lightmode.png'),
 (2,'mongolz','The MongolZ','https://liquipedia.net/commons/images/2/2b/The_MongolZ_2024_03_allmode.png'),
 (2,'astralis','Astralis','https://thumb.wikimedia.org/wikipedia/commons/thumb/4/44/Astralis.svg/1920px-Astralis.svg.png'),
 (2,'nemiga','Nemiga','https://img-cdn.hltv.org/teamlogo/6ZPCm5r3XyGByXkFGiRnLh.png?ixlib=java-2.1.0&w=400&s=59d576bc8e2e90fc1670772444f90216'),
 (2,'g2','G2','https://liquipedia.net/commons/images/thumb/4/4b/G2_Esports_2020_lightmode.png/600px-G2_Esports_2020_lightmode.png'),
 (2,'1win','1W','https://liquipedia.net/commons/images/thumb/5/5c/1win_Team_2024_allmode.png/398px-1win_Team_2024_allmode.png'),
 (2,'navi','Natus Vincere','https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/e/ef/Natus_Vincerelogo_square.png/revision/latest?cb=20250519222608'),
 (2,'mibr','MIBR','https://upload.wikimedia.org/wikipedia/commons/5/53/Made_In_Brazil_logo.png')
 on conflict(stage,team) do update set name=excluded.name,logo=excluded.logo;
-- Store pairs in SEED order, not chronological order. Existing clients use this order.
insert into public.rewards_major_pickem_pairs(stage,slot,team_a,team_b,starts_at) values
 (2,1,'fut','flyquest','2026-11-28 04:00:00+00'),
 (2,2,'nemiga','nip','2026-11-28 05:00:00+00'),
 (2,3,'g2','liquid','2026-11-28 06:00:00+00'),
 (2,4,'1win','eternal-fire','2026-11-28 06:00:00+00'),
 (2,5,'navi','parivision','2026-11-28 07:00:00+00'),
 (2,6,'astralis','imperial','2026-11-28 05:00:00+00'),
 (2,7,'mongolz','lynn-vision','2026-11-28 04:00:00+00'),
 (2,8,'mibr','100t','2026-11-28 07:00:00+00')
 on conflict(stage,slot) do update set team_a=excluded.team_a,team_b=excluded.team_b,starts_at=excluded.starts_at;
do $$
begin
 if (select count(*) from public.rewards_major_pickem_teams where stage=2)<>16 or
    (select count(distinct team) from (select team_a team from public.rewards_major_pickem_pairs where stage=2 union all select team_b from public.rewards_major_pickem_pairs where stage=2) t)<>16
 then raise exception 'invalid_stage_two_slate'; end if;
end $$;
select public.rewards_major_pickem_settle(1,'{"nip":"3:0","flyquest":"3:0","bcgame":"0:3","dendele":"0:3","eternal-fire":"3:1","liquid":"3:1","parivision":"3:1","faze":"1:3","9z":"1:3","chinggis":"1:3","imperial":"3:2","wildcard":"2:3","100t":"3:2","m80":"2:3","lynn-vision":"3:2","heroic":"2:3"}'::jsonb);
update public.rewards_major_pickem_stages set open_at='2026-11-27 21:00:00+00',lock_at='2026-11-28 03:45:00+00',first_match_at='2026-11-28 04:00:00+00' where stage=2;
