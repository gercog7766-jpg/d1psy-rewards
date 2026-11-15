import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const previewMigration = await readFile(new URL('../supabase/migrations/20261115113500_pick_prize_preview.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261115103000_pick.sql', import.meta.url), 'utf8');

test('Pick hides five unique price tiers until one card is chosen and settles only once', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table rewards_users(id uuid primary key default gen_random_uuid(), twitch_user_id text unique, banned boolean default false, participation_restricted boolean default false);
      create table rewards_shop_items(id uuid primary key default gen_random_uuid(), name text, image_url text, status text, stock integer, price_coins integer);
      create table rewards_shop_item_variants(shop_item_id uuid, variant_kind text, wear text, price_coins integer, available boolean, id uuid default gen_random_uuid());
      create table rewards_prizes(id uuid primary key default gen_random_uuid(), name text, image_url text, status text, unlimited boolean, draw_weight integer, sell_price_coins integer);
      create table rewards_wins(id uuid primary key default gen_random_uuid(), round_id uuid, user_id uuid, prize_id uuid, delivery_status text, choice_status text, item_wear text, item_variant_kind text, source_type text);
      create table rewards_coin_transactions(user_id uuid, amount integer, transaction_type text, note text);
      grant select, update on rewards_users to service_role;
      grant select on rewards_shop_items, rewards_shop_item_variants to service_role;
      grant select, insert on rewards_coin_transactions, rewards_prizes, rewards_wins to service_role;
      insert into rewards_users(twitch_user_id) values ('alice'), ('bob');
      insert into rewards_coin_transactions select id, 100, 'adjustment', 'fixture' from rewards_users;
      insert into rewards_shop_items(name,image_url,status,price_coins)
        select 'Skin ' || price, 'https://example.com/skin.png','available',price from unnest(array[7,15,25,50,100]) price;
      insert into rewards_shop_item_variants(shop_item_id,variant_kind,wear,price_coins,available) select id,'normal','FT',price_coins,true from rewards_shop_items where price_coins <> 7;
    `);
    await db.exec(migration);
    await db.exec(previewMigration);
    await db.exec('set role service_role');
    const call = async (action, id = null, value = null, actor = 'alice') =>
      (await db.query('select public.rewards_pick($1,$2,$3,$4) as data', [actor,action,id,value])).rows[0].data;

    const before = await call('state');
    assert.deepEqual(before.prices, [7,15,25,50,100]);
    assert.equal(before.preview.length, 5);
    assert.deepEqual(before.preview.map(item => item.name), ['Skin 100','Skin 15','Skin 25','Skin 50','Skin 7']);
    assert(before.preview.every(item => Object.keys(item).sort().join(',') === 'image,name'));
    const id = randomUUID();
    await assert.rejects(call('start', id, 10), /quote_changed/);
    const started = await call('start', id, 7);
    assert.deepEqual(started.attempt, {id, chosen:null});
    assert.equal(started.balance, 50);
    assert.deepEqual(started.preview, before.preview);
    assert.deepEqual((await call('state')).preview, before.preview);
    assert.deepEqual((await call('state')).attempt, started.attempt);
    assert.equal((await call('start', id, 7)).balance, 50);
    await assert.rejects(call('start', randomUUID(), 7), /attempt_in_progress/);
    await assert.rejects(call('reveal', id, 1, 'bob'), /invalid_attempt/);
    const revealed = await call('reveal', id, 3);
    assert.deepEqual(revealed.attempt.cards.map(card => card.price).sort((a,b) => a-b), [7,15,25,50,100]);
    assert.equal(revealed.attempt.chosen, 3);
    assert.deepEqual(revealed.preview, before.preview);
    assert.deepEqual((await call('reveal', id, 3)).attempt, revealed.attempt);
    await assert.rejects(call('reveal', id, 4), /invalid_attempt/);
    assert.deepEqual((await db.query('select sell_price_coins, source_type from rewards_wins join rewards_prizes on prize_id = rewards_prizes.id')).rows,
      [{sell_price_coins:revealed.attempt.cards[2].price,source_type:'pick'}]);

    await db.exec("reset role; insert into rewards_shop_items(name,status,price_coins) values('Skin 10','available',10); set role service_role");
    assert.deepEqual((await call('state')).prices, [10,15,25,50,100]);
    const next = await call('start', randomUUID(), 10);
    assert.equal(next.balance, 0);
    assert.equal(Object.hasOwn(next.attempt, 'cards'), false);
    await assert.rejects(call('start', id, 7), /invalid_attempt/);
    for (const role of ['anon','authenticated']) {
      await db.exec('reset role; set role ' + role);
      await assert.rejects(call('state'), /permission denied/);
      await assert.rejects(db.exec('select cards from rewards_pick_attempts'), /permission denied/);
    }
  } finally {
    await db.close();
  }
});
