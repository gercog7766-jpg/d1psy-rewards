create or replace function public.rewards_red_button(p_actor text,p_round uuid default null,p_request uuid default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
  player public.rewards_users;
  game public.rewards_red_button_rounds;
  member public.rewards_red_button_members;
  prior public.rewards_red_button_holds;
  stamp timestamptz;
  can_play boolean;
begin
  select * into player from public.rewards_users where twitch_user_id=p_actor and not coalesce(banned,false);
  if not found then raise exception 'user_unavailable'; end if;
  can_play := not coalesce(player.participation_restricted,false);
  perform public.rewards_red_button_tick();
  if p_round is not null then
    if not can_play then raise exception 'user_unavailable'; end if;
    if p_request is null then raise exception 'invalid_request'; end if;
    select * into game from public.rewards_red_button_rounds where id=p_round for update;
    if game.id is null then raise exception 'round_closed'; end if;
    select * into prior from public.rewards_red_button_holds where request_id=p_request;
    if prior.request_id is not null and (prior.round_id<>p_round or prior.user_id<>player.id) then
      raise exception 'invalid_request';
    end if;
    if prior.request_id is null then
      select * into member from public.rewards_red_button_members where round_id=game.id and user_id=player.id;
      perform 1 from public.rewards_users where id=player.id and not banned and not participation_restricted for update;
      if not found then raise exception 'user_unavailable'; end if;
      stamp := clock_timestamp();
      if game.closed_at is not null or stamp>=game.ends_at then raise exception 'round_closed'; end if;
      if game.holder=player.id then raise exception 'already_holding'; end if;
      if stamp<member.last_press+interval '20 minutes' then raise exception 'cooldown'; end if;
      if member.user_id is null then
        if (select coalesce(sum(amount),0) from public.rewards_coin_transactions where user_id=player.id)<10 then
          raise exception 'insufficient_coins';
        end if;
        insert into public.rewards_coin_transactions(user_id,amount,transaction_type,note)
          values(player.id,-10,'adjustment','Красная кнопка · вход · '||game.id);
      end if;
      insert into public.rewards_red_button_members(round_id,user_id,last_press) values(game.id,player.id,stamp)
        on conflict(round_id,user_id) do update set last_press=excluded.last_press;
      update public.rewards_red_button_holds set ended_at=stamp where round_id=game.id and ended_at is null;
      insert into public.rewards_red_button_holds(request_id,round_id,user_id,started_at)
        values(p_request,game.id,player.id,stamp);
      update public.rewards_red_button_rounds set holder=player.id,held_since=stamp where id=game.id;
    end if;
  end if;
  select * into game from public.rewards_red_button_rounds where day=(clock_timestamp() at time zone 'Europe/Moscow')::date;
  select * into member from public.rewards_red_button_members where round_id=game.id and user_id=player.id;

  return jsonb_build_object('now',clock_timestamp(),'canPlay',can_play,
    'round',case when game.id is not null then jsonb_build_object(
      'id',game.id,'endsAt',game.ends_at,'prize',game.prize_name,'image',game.image_url,'wear',game.wear,'price',game.price,
      'playerCount',(select count(*) from public.rewards_red_button_members m where m.round_id=game.id),
      'holder',(select coalesce(nullif(twitch_display_name,''),twitch_login) from public.rewards_users where id=game.holder),
      'holding',coalesce(game.holder=player.id,false),'joined',member.user_id is not null,
      'readyAt',member.last_press+interval '20 minutes') end,
    'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.day desc),'[]'::jsonb) from (
      select r.day,coalesce(nullif(u.twitch_display_name,''),u.twitch_login) nick,r.prize_name as skin,r.winning_ms as duration
      from public.rewards_red_button_rounds r join public.rewards_users u on u.id=r.winner
      where r.closed_at is not null order by r.day desc limit 20
    ) h));
end;
$$;
