import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('Major Pick’em gates entry and validates the complete Swiss slate before the deadline', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table rewards_users(id uuid primary key default gen_random_uuid(), twitch_user_id text unique, banned boolean default false, participation_restricted boolean default false);
      create table rewards_coin_transactions(user_id uuid, amount int, transaction_type text, note text);
      grant select,update on rewards_users to service_role;
      grant select,insert on rewards_coin_transactions to service_role;
      insert into rewards_users(twitch_user_id) values('alice'),('bob');
      insert into rewards_coin_transactions select id,500,'adjustment','fixture' from rewards_users where twitch_user_id='alice';
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20261115150000_major_pickem.sql',import.meta.url),'utf8'));
    const { rows:[timing] } = await db.query("select extract(epoch from first_match_at-lock_at)::int as seconds from rewards_major_pickem_stages where stage=1");
    assert.equal(timing.seconds,900);
    await db.exec("update rewards_major_pickem_stages set open_at=now()-interval '1 day',lock_at=now()+interval '1 day',first_match_at=now()+interval '2 days' where stage=1; set role service_role");
    const call = async (who,action,stage=null,picks=null) =>
      (await db.query('select rewards_major_pickem($1,$2,$3,$4) as result',[who,action,stage,picks])).rows[0].result;
    const state = await call('alice','state');
    const first = state.stages[0];
    assert.equal(state.stages.length,4);
    assert.equal(first.teams.length,16);
    assert.equal(first.pairs.length,8);
    assert.equal(new Set(first.pairs.flatMap(pair=>[pair.a,pair.b])).size,16);
    await assert.rejects(call('alice','save',1,{}),/entry_required/);
    await assert.rejects(call('bob','enter'),/insufficient_coins/);
    assert.equal((await call('alice','enter')).balance,250);
    assert.equal((await call('alice','enter')).balance,250);
    const scores=['3:0','3:0','3:1','3:1','3:1','3:2','3:2','3:2','1:3','1:3','1:3','2:3','2:3','2:3','0:3','0:3'];
    const picks=Object.fromEntries(first.teams.map((team,i)=>[team.id,scores[i]]));
    await assert.rejects(call('alice','save',1,{...picks,[first.teams[0].id]:'0:3'}),/invalid_picks/);
    await assert.rejects(call('alice','save',2,picks),/stage_locked/);
    assert.deepEqual((await call('alice','save',1,picks)).stages[0].picks,picks);
    assert.equal((await call('bob','state')).stages[0].picks,null);
    await db.exec("reset role; update rewards_major_pickem_stages set lock_at=now()-interval '1 second' where stage=1; set role service_role");
    await assert.rejects(call('alice','save',1,picks),/stage_locked/);
    await assert.rejects(call('bob','enter'),/entry_closed/);
    await db.exec('reset role; set role authenticated');
    await assert.rejects(call('alice','state'),/permission denied/);
  } finally {
    await db.close();
  }
});
