create or replace function public.rewards_skin_battle_join(p_user uuid,p_battle uuid,p_win_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare b public.rewards_skin_battles%rowtype; nick text; avatar text; prize uuid; prize_value integer; wear text; variant_kind text;
 total integer; roll integer; selected_entry uuid; selected_user uuid; award_entry record; award_id uuid; row_count integer;
begin
 perform 1 from public.rewards_users where id=p_user and not banned and not participation_restricted for update;
 if not found then raise exception 'user_not_found'; end if;
 select * into b from public.rewards_skin_battles where id=p_battle for update;
 if not found then raise exception 'battle_not_found'; end if;
 if exists(select 1 from public.rewards_skin_battle_entries where battle_id=p_battle and user_id=p_user)
 then return jsonb_build_object('ok',true,'battle',public.rewards_skin_battle_json(p_battle)); end if;
 if b.status<>'waiting' or b.expires_at<=clock_timestamp() then raise exception 'battle_closed'; end if;
 if exists(select 1 from public.rewards_skin_battle_entries e join public.rewards_skin_battles x on x.id=e.battle_id
   where e.user_id=p_user and e.status='reserved' and x.status='waiting') then raise exception 'already_in_battle'; end if;
 if (select count(*) from public.rewards_skin_battle_entries where battle_id=p_battle and status='reserved')>=b.max_players then raise exception 'battle_full'; end if;
 select coalesce(u.twitch_display_name,u.twitch_login,'Игрок'),u.twitch_avatar_url,p.id,p.sell_price_coins,w.item_wear,w.item_variant_kind
 into nick,avatar,prize,prize_value,wear,variant_kind
 from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id
 join public.rewards_users u on u.id=w.user_id
 where w.id=p_win_id and w.user_id=p_user and w.choice_status='awaiting_choice'
  and w.delivery_status in('pending','awaiting_choice') and w.delivered_at is null
  and p.sell_price_coins>0
 for update of w,p;
 if not found then raise exception 'skin_not_available'; end if;
 update public.rewards_wins set choice_status='contracted',choice_at=clock_timestamp()
  where id=p_win_id and user_id=p_user and choice_status='awaiting_choice';
 get diagnostics row_count=ROW_COUNT;
 if row_count<>1 then raise exception 'skin_not_available'; end if;
 insert into public.rewards_skin_battle_entries(battle_id,user_id,source_win_id,prize_id,value,item_wear,item_variant_kind,display_name,avatar_url)
  values(p_battle,p_user,p_win_id,prize,prize_value,wear,variant_kind,nick,avatar);
 select coalesce(sum(value),0)::integer into total from public.rewards_skin_battle_entries where battle_id=p_battle and status='reserved';
 if (select count(*) from public.rewards_skin_battle_entries where battle_id=p_battle and status='reserved')=b.max_players then
  roll:=floor((('x'||substr(replace(gen_random_uuid()::text,'-',''),1,12))::bit(48)::bigint)::numeric
    /281474976710656*total)::integer+1;
  select id,user_id into selected_entry,selected_user from(
   select id,user_id,sum(value) over(order by created_at,id) cumulative
   from public.rewards_skin_battle_entries where battle_id=p_battle and status='reserved'
  )q where q.cumulative>=roll order by q.cumulative limit 1;
  update public.rewards_skin_battles set status='completed',total_value=total,winner_user_id=selected_user,
   winner_entry_id=selected_entry,draw_value=roll,resolved_at=clock_timestamp() where id=p_battle;
  for award_entry in select id,prize_id,item_wear,item_variant_kind from public.rewards_skin_battle_entries where battle_id=p_battle and status='reserved' order by created_at,id loop
   insert into public.rewards_wins(user_id,prize_id,source_type,delivery_status,choice_status,item_wear,item_variant_kind)
    values(selected_user,award_entry.prize_id,'skin_battle','awaiting_choice','awaiting_choice',award_entry.item_wear,award_entry.item_variant_kind) returning id into award_id;
   update public.rewards_skin_battle_entries set status='transferred',awarded_win_id=award_id where id=award_entry.id;
  end loop;
 else
  update public.rewards_skin_battles set total_value=total where id=p_battle;
 end if;
 return jsonb_build_object('ok',true,'battle',public.rewards_skin_battle_json(p_battle));
end; $$
