import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/20261115092000_three_doors.sql', import.meta.url), 'utf8');

test('three doors keeps the prize private and charges and awards once across retries', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table rewards_users(id uuid primary key default gen_random_uuid(), twitch_user_id text unique, banned boolean default false, participation_restricted boolean default false);
      create table rewards_shop_items(id uuid primary key default gen_random_uuid(), name text, image_url text, status text, stock integer);
      create table rewards_shop_item_variants(shop_item_id uuid, variant_kind text, wear text, price_coins integer, available boolean);
      create table rewards_prizes(id uuid primary key default gen_random_uuid(), name text, image_url text, status text, unlimited boolean, draw_weight integer, sell_price_coins integer);
      create table rewards_wins(id uuid primary key default gen_random_uuid(), round_id uuid, user_id uuid, prize_id uuid, delivery_status text, choice_status text, item_wear text, item_variant_kind text, source_type text);
      create table rewards_coin_transactions(user_id uuid, amount integer, transaction_type text, note text);
      grant select, update on rewards_users to service_role;
      grant select on rewards_shop_items, rewards_shop_item_variants to service_role;
      grant select, insert on rewards_coin_transactions, rewards_prizes, rewards_wins to service_role;
      insert into rewards_users(twitch_user_id) values ('alice'), ('bob');
      insert into rewards_coin_transactions select id, 100, 'adjustment', 'fixture' from rewards_users;
      insert into rewards_shop_items(name, status) values ('Test skin', 'available');
      insert into rewards_shop_item_variants select id, 'normal', 'FT', 30, true from rewards_shop_items;
    `);
    await db.exec(migration);
    await db.exec('set role service_role');
    const call = async (action, id = null, stake = null, door = null, actor = 'alice') =>
      (await db.query('select public.rewards_three_doors($1,$2,$3,$4,$5) as state', [actor, action, id, stake, door])).rows[0].state;

    const id = randomUUID();
    await assert.rejects(call('start', randomUUID(), 25), /prize_unavailable/);
    await assert.rejects(call('start', randomUUID(), 150), /insufficient_coins/);
    const first = await call('start', id, 15);
    assert.equal(first.balance, 85);
    assert.equal(first.attempt.prize.price, 30);
    assert.equal(first.attempt.prize.sale, 19);
    assert.equal(Object.hasOwn(first.attempt, 'prizeDoor'), false);
    assert.deepEqual((await call('state')).attempt, first.attempt);
    assert.equal((await call('start', id, 15)).balance, 85);
    await assert.rejects(call('start', randomUUID(), 15), /attempt_in_progress/);
    await assert.rejects(call('pick', id, null, 1, 'bob'), /invalid_attempt/);
    assert.equal((await call('state', null, null, null, 'bob')).attempt, null);
    await assert.rejects(call('finish', id, null, 1), /invalid_attempt/);

    const secret = (await db.query('select prize_door from rewards_three_doors_attempts where id=$1', [id])).rows[0].prize_door;
    const picked = await call('pick', id, null, 1);
    assert.notEqual(picked.attempt.emptyDoor, 1);
    assert.notEqual(picked.attempt.emptyDoor, secret);
    assert.equal(Object.hasOwn(picked.attempt, 'prizeDoor'), false);
    assert.deepEqual((await call('pick', id, null, 1)).attempt, picked.attempt);
    await assert.rejects(call('pick', id, null, 2), /invalid_attempt/);
    await assert.rejects(call('finish', id, null, picked.attempt.emptyDoor), /invalid_attempt/);

    const finished = await call('finish', id, null, secret);
    assert.equal(finished.attempt.prizeDoor, secret);
    assert.equal(finished.attempt.won, true);
    assert.equal((await call('finish', id, null, secret)).balance, 85);
    await assert.rejects(call('start', randomUUID(), 15), /cooldown/);
    const { rows } = await db.query('select sell_price_coins, source_type from rewards_wins join rewards_prizes on prize_id = rewards_prizes.id');
    assert.deepEqual(rows, [{ sell_price_coins: 19, source_type: 'three_doors' }]);

    await db.query("update rewards_three_doors_attempts set started_at = now() - interval '3 hours' where id=$1", [id]);
    assert.equal((await call('state')).attempt.finalDoor, secret);
    assert.equal((await call('start', randomUUID(), 15)).balance, 70);
    await assert.rejects(call('start', id, 15), /invalid_attempt/);
    for (const role of ['anon', 'authenticated']) {
      await db.exec('reset role; set role ' + role);
      await assert.rejects(call('state'), /permission denied/);
      await assert.rejects(db.exec('select prize_door from rewards_three_doors_attempts'), /permission denied/);
    }
  } finally {
    await db.close();
  }
});
