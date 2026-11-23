-- Successful holds are counted per player and daily round, including existing holds.
create or replace function public.rewards_red_button(p_actor text,p_round uuid default null,p_request uuid default null)
returns jsonb language plpgsql set search_path='' as $$
declare
  player public.rewards_users; game public.rewards_red_button_rounds; member public.rewards_red_button_members;
  prior public.rewards_red_button_holds; stamp timestamptz; can_play boolean;
  entry_cost integer; cooldown_minutes integer; modern boolean; jackpot boolean; rules jsonb; visible_round jsonb; participants integer; presses_used integer;
begin
  select * into player from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false);
  if not found then raise exception 'user_unavailable'; end if;
  can_play:=not coalesce(player.participation_restricted,false);
  perform public.rewards_red_button_tick();
  if p_round is not null then
    if not can_play then raise exception 'user_unavailable'; end if;
    if p_request is null then raise exception 'invalid_request'; end if;
    select * into game from public.rewards_red_button_rounds where id=p_round for update;
    if game.id is null then raise exception 'round_closed'; end if;
    select * into prior from public.rewards_red_button_holds where request_id=p_request;
    if prior.request_id is not null and (prior.round_id<>p_round or prior.user_id<>player.id) then raise exception 'invalid_request'; end if;
    if prior.request_id is null then
      select * into member from public.rewards_red_button_members where round_id=game.id and user_id=player.id;
      perform 1 from public.rewards_users where id=player.id and not banned and not participation_restricted for update;
      if not found then raise exception 'user_unavailable'; end if;
      stamp:=clock_timestamp();
      if game.closed_at is not null or stamp>=game.ends_at or stamp<game.starts_at then raise exception 'round_closed'; end if;
      if game.jackpot and (select count(*) from public.rewards_red_button_holds where round_id=game.id and user_id=player.id)>=6 then raise exception 'press_limit'; end if;
      modern:=game.day>=date '2026-11-21';
      if modern and game.held_since+interval '15 minutes'<=stamp then
        update public.rewards_red_button_holds set ended_at=least(started_at+interval '15 minutes',game.ends_at)
          where round_id=game.id and ended_at is null;
        update public.rewards_red_button_rounds set holder=null,held_since=null where id=game.id;
        game.holder:=null;
      end if;
      if game.holder=player.id then raise exception 'already_holding'; end if;
      entry_cost:=case when game.jackpot then 10 when modern then 15 when game.day>=date '2026-11-20' then 20 else 10 end;
      cooldown_minutes:=case when modern then 30 when game.day>=date '2026-11-20' then 60 else 20 end;
      if stamp<member.last_press+make_interval(mins=>cooldown_minutes) then raise exception 'cooldown'; end if;
      if member.user_id is null then
        if (select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=player.id)<entry_cost then raise exception 'insufficient_coins'; end if;
        insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
          values(player.id,-entry_cost,'adjustment','Красная кнопка · вход · '||game.id);
      end if;
      insert into public.rewards_red_button_members(round_id,user_id,last_press) values(game.id,player.id,stamp)
        on conflict(round_id,user_id) do update set last_press=excluded.last_press;
      if member.user_id is null then
        if game.jackpot then perform public.rewards_red_button_jackpot_refresh(game.id);
        elsif modern then perform public.rewards_red_button_refresh_prize(game.id);end if;
      end if;
      update public.rewards_red_button_holds set ended_at=case when modern then least(stamp,started_at+interval '15 minutes') else stamp end
        where round_id=game.id and ended_at is null;
      insert into public.rewards_red_button_holds(request_id,round_id,user_id,started_at) values(p_request,game.id,player.id,stamp);
      update public.rewards_red_button_rounds set holder=player.id,held_since=stamp where id=game.id;
    end if;
  end if;
  select * into game from public.rewards_red_button_rounds where closed_at is null and starts_at<=clock_timestamp() and ends_at>clock_timestamp() order by day desc limit 1;
  select * into member from public.rewards_red_button_members where round_id=game.id and user_id=player.id;
  modern:=coalesce(game.day,(clock_timestamp() at time zone 'Europe/Moscow')::date)>=date '2026-11-21';
  jackpot:=coalesce(game.jackpot,false);
  entry_cost:=case when jackpot then 10 when modern then 15 when coalesce(game.day,(clock_timestamp() at time zone 'Europe/Moscow')::date)>=date '2026-11-20' then 20 else 10 end;
  cooldown_minutes:=case when modern then 30 when entry_cost=20 then 60 else 20 end;
  rules:=jsonb_build_object('entryCost',entry_cost,'cooldownMinutes',cooldown_minutes);
  if jackpot then rules:=rules||jsonb_build_object('roundHours',24,'holdMinutes',15,'jackpot',true,'bonusAfter',10,'bonusEach',10,'pressLimit',6);
  elsif modern then rules:=rules||jsonb_build_object('roundHours',48,'holdMinutes',15);
  else rules:=rules||jsonb_build_object('prizeMin',50,'prizeMax',case when cooldown_minutes=60 then 200 else 300 end); end if;
  if game.id is not null then
    visible_round:=jsonb_build_object('id',game.id,'endsAt',game.ends_at,'prize',game.prize_name,'image',game.image_url,
      'playerCount',(select count(*) from public.rewards_red_button_members m where m.round_id=game.id),
      'holder',(select coalesce(nullif(twitch_display_name,''),twitch_login) from public.rewards_users where id=game.holder),
      'holding',coalesce(game.holder=player.id,false),'joined',member.user_id is not null,
      'readyAt',member.last_press+make_interval(mins=>cooldown_minutes));
    if jackpot then
      presses_used:=(select count(*)::integer from public.rewards_red_button_holds where round_id=game.id and user_id=player.id);
      visible_round:=visible_round||jsonb_build_object('pressesUsed',presses_used,'pressesRemaining',greatest(0,6-presses_used));
      participants:=(select count(*)::integer from public.rewards_red_button_members where round_id=game.id);
      visible_round:=visible_round||jsonb_build_object('bank',game.price::bigint+game.carry_out,'winnerPrize',game.price,'nextBank',game.carry_out,'carryIn',game.carry_in,'entryBank',participants::bigint*10,'dropsoBonusEach',greatest(0,participants-10)::bigint*10,'wear',game.wear,'price',game.price);
    elsif not modern then visible_round:=visible_round||jsonb_build_object('wear',game.wear,'price',game.price); end if;
  end if;
  return jsonb_build_object('now',clock_timestamp(),'canPlay',can_play,'rules',rules,'round',visible_round,
    'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.day desc),'[]'::jsonb) from (
      select r.day,coalesce(nullif(u.twitch_display_name,''),u.twitch_login) nick,r.prize_name as skin,r.winning_ms as duration
      from public.rewards_red_button_rounds r join public.rewards_users u on u.id=r.winner
      where r.closed_at is not null order by r.day desc limit 20) h));
end $$;
notify pgrst,'reload schema';
