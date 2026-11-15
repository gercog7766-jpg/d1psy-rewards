import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = name => readFile(new URL('../supabase/migrations/' + name + '.sql', import.meta.url), 'utf8');

test('retiring shared games refunds only unsettled rounds and cannot refund twice', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table rewards_users(id uuid primary key default gen_random_uuid(), twitch_display_name text, twitch_login text);
      create table rewards_prizes(id uuid primary key default gen_random_uuid(), name text, image_url text);
      create table rewards_wins(id uuid primary key default gen_random_uuid());
      create table rewards_coin_transactions(user_id uuid, amount integer, transaction_type text, note text);
      insert into rewards_users(twitch_login) values ('player');
      insert into rewards_prizes(name) values ('skin');
    `);
    await db.exec(await migration('20261112073832_blind_final'));
    await db.exec(await migration('20261112130354_piggy_bank'));
    await db.exec(`
      insert into rewards_blind_rounds(starts_at,ends_at,low_number,high_number,entry_fee,prize_id,status)
        select now()-interval '2 days',now()-interval '1 day',1,5,10,id,state
        from rewards_prizes cross join unnest(array['open','won']) state;
      insert into rewards_blind_entries(round_id,user_id,number)
        select r.id,u.id,3 from rewards_blind_rounds r cross join rewards_users u;
      insert into rewards_piggy_days(day,status,pot,prize_budget) values ('2026-11-12','awarded',50,45);
      insert into rewards_piggy_entries(day,user_id,amount)
        select d.day,u.id,d.amount from rewards_users u cross join
          (values (date '2026-11-12',50),(date '2026-11-13',30)) d(day,amount);
    `);
    const retire = await migration('20261115111000_retire_piggy_bank_blind_final');
    await db.transaction(tx => tx.exec(retire));
    await db.transaction(tx => tx.exec(retire));

    const { rows } = await db.query('select amount from rewards_coin_transactions order by amount');
    assert.deepEqual(rows, [{amount:10},{amount:30}]);
    assert.equal((await db.query("select count(*)::int as n from rewards_blind_rounds where status='open'")).rows[0].n, 0);
    assert.equal((await db.query("select status from rewards_piggy_days where day='2026-11-13'")).rows[0].status, 'refunded');
    await db.exec('set role service_role; select public.rewards_blind_finish(); select public.rewards_piggy_close()');
    await assert.rejects(db.exec('select public.rewards_blind_start(null,1,1,5,10)'), /permission denied/);
    await assert.rejects(db.exec('select public.rewards_piggy_add(null,current_date,10,null)'), /permission denied/);
  } finally {
    await db.close();
  }
});
