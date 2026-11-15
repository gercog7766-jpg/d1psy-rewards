import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { initialCheckers, moveCheckers } from '../src/checkers-rules.ts';

test('Russian draughts requires captures and keeps one turn after mid-capture promotion', () => {
  const pos = initialCheckers();
  assert.equal(pos.board.filter(p => p === 'w').length, 12);
  assert.equal(pos.board.filter(p => p === 'b').length, 12);
  assert.equal(moveCheckers(pos, 40, 33).position.turn, 'b');

  pos.board.fill('');
  pos.board[17] = 'w';
  pos.board[40] = 'w';
  pos.board[10] = 'b';
  pos.board[12] = 'b';
  assert.equal(moveCheckers(pos, 40, 33), null);
  const first = moveCheckers(pos, 17, 3);
  assert.equal(first.position.board[3], 'W');
  assert.equal(first.position.forced, 3);
  assert.equal(first.position.turn, 'w');
  assert.equal(first.position.board[10], 'b');
  assert.equal(moveCheckers(first.position, 40, 33), null);
  const second = moveCheckers(first.position, 3, 21);
  assert.equal(second.winner, 'w');
  assert.equal(second.position.board[10], '');
  assert.equal(second.position.board[12], '');

  const backwards = initialCheckers();
  backwards.board.fill('');
  backwards.board[19] = 'w';
  backwards.board[26] = 'b';
  assert.equal(moveCheckers(backwards, 19, 33).winner, 'w');
});

test('rooms reserve an equal skin, pay 90% once, refund draws and enforce time and privacy', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table rewards_users(id uuid primary key default gen_random_uuid(), twitch_user_id text unique,
        twitch_login text, twitch_display_name text, banned boolean default false, participation_restricted boolean default false);
      create table rewards_prizes(id uuid primary key default gen_random_uuid(), name text, sell_price_coins integer);
      create table rewards_wins(id uuid primary key default gen_random_uuid(), user_id uuid, prize_id uuid, choice_status text, delivery_status text);
      create table rewards_coin_transactions(user_id uuid,amount integer,transaction_type text,note text);
      create table rewards_ttt_rooms(id uuid primary key,host_id uuid,guest_id uuid);
      create table rewards_live_chat(id bigint generated always as identity primary key,room_id uuid references rewards_ttt_rooms,
        sender_id uuid,nick text,message text,created_at timestamptz default clock_timestamp());
      create function rewards_sell_win(win uuid, player uuid) returns integer language plpgsql as $$
      declare price integer;
      begin
        select p.sell_price_coins into strict price from public.rewards_wins w join public.rewards_prizes p on p.id=w.prize_id where w.id=win and w.user_id=player;
        update public.rewards_wins set choice_status='sold' where id=win;
        insert into public.rewards_coin_transactions values(player,price,'win_sale','fixture');
        return price;
      end; $$;
      grant select,update on rewards_users,rewards_wins to service_role;
      grant select on rewards_prizes,rewards_ttt_rooms to service_role;
      grant select,insert on rewards_coin_transactions to service_role;
      grant select,insert,delete on rewards_live_chat to service_role;
      grant usage on sequence rewards_live_chat_id_seq to service_role;
      insert into rewards_users(twitch_user_id,twitch_login) values('a','Alice'),('b','Bob'),('c','Carol');
      insert into rewards_coin_transactions select id,100,'adjustment','fixture' from rewards_users;
      insert into rewards_prizes(name,sell_price_coins) values('Skin',30);
      insert into rewards_wins(user_id,prize_id,choice_status,delivery_status)
        select u.id,p.id,'awaiting_choice','pending' from rewards_users u cross join rewards_prizes p where u.twitch_user_id='b';
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20261115120000_checkers.sql',import.meta.url),'utf8'));
    await db.exec('set role service_role');
    const call = async (actor, id, action, payload={}) =>
      (await db.query('select rewards_checkers_action($1,$2,$3,$4) as data',[actor,id,action,payload])).rows[0].data;
    const state = async (actor,id=null) =>
      (await db.query('select rewards_checkers_state($1,$2) as data',[actor,id])).rows[0].data;
    const id = randomUUID(), position = initialCheckers();
    const skin = (await state('b')).skins[0].id;
    await call('a',id,'create',{stake:30,proof:'private-proof',position});
    await call('a',id,'create',{stake:30,proof:'private-proof',position});
    assert.equal((await state('a')).balance,70);
    assert.equal(Object.hasOwn(await state('b',id),'password_hash'),false);
    await assert.rejects(call('b',id,'join',{skin,proof:'wrong'}),/wrong_password/);
    assert.equal((await state('b')).skins.length,1);
    await call('b',id,'join',{skin,proof:'private-proof'});
    assert.equal((await state('b')).balance,100);
    assert.equal((await state('b')).skins.length,0);
    await assert.rejects(state('c',id),/not_participant/);
    await assert.rejects(db.query("select rewards_live_chat_feed('c',$1,'hi')",[id]),/chat_unavailable/);
    assert.equal((await db.query("select rewards_live_chat_feed('a',$1,'hi') as data",[id])).rows[0].data.length,1);
    const next = moveCheckers(position,40,33).position;
    await call('a',id,'move',{revision:0,position:next});
    await assert.rejects(call('a',id,'move',{revision:0,position:next}),/not_your_turn/);
    await call('b',id,'leave');
    await call('b',id,'leave');
    assert.equal((await state('a',id)).winner,'w');
    assert.equal((await state('a')).balance,124);

    const second = randomUUID();
    await call('a',second,'create',{stake:10,position});
    await call('b',second,'join');
    await call('b',second,'draw');
    await call('a',second,'draw');
    assert.equal((await state('a',second)).status,'draw');
    assert.equal((await state('a')).balance,124);
    const third = randomUUID();
    await call('a',third,'create',{stake:10,position});
    await call('b',third,'join');
    await db.query("update rewards_checkers_rooms set deadline=clock_timestamp()-interval '1 second' where id=$1",[third]);
    assert.equal((await state('a',third)).winner,'b');
    assert.equal((await state('b')).balance,108);
    await db.exec('reset role; set role authenticated');
    await assert.rejects(state('a',id),/permission denied/);
  } finally {
    await db.close();
  }
});
