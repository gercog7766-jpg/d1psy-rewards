// Isolated transaction-only start/stop integration test. No persisted mutations.
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
const expected = 'd1psy_multistream_test_db';
const url = process.env.DATABASE_URL;
if (process.env.ISOLATED_TEST_API !== 'true' || process.env.VERIFY_START_STOP !== 'true' ||
    !url || new URL(url).pathname.slice(1) !== expected) throw new Error('Isolated verification guard failed');
const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5000 });
const client = await pool.connect();
const secondary = '00000000-0000-4000-8000-000000000002';
const primary = '00000000-0000-4000-8000-000000000001';
let begun = false;
try {
  await client.query('BEGIN');
  begun = true;
  const { rows: [db] } = await client.query('select current_database() as name');
  if (db.name !== expected) throw new Error('Unexpected database');
  // These additional columns and RPCs exist ONLY inside this rolled-back transaction.
  await client.query(`
    alter table public.rewards_streamer_settings
      add column mode text not null default 'time',
      add column interval_seconds integer not null default 120,
      add column message_threshold integer not null default 100,
      add column selected_prize_id uuid;
    alter table public.rewards_rounds
      add column mode text not null default 'time',
      add column interval_seconds integer not null default 120,
      add column message_threshold integer not null default 100;
  `);
  for (const file of [
    'migrations/20261104_atomic_start_proposal.sql',
    'migrations/20261104_atomic_stop_proposal.sql'
  ]) {
    const sql = readFileSync(file, 'utf8').replace(/^revoke all on function[\\s\\S]*?;\\s*$/gm, '').replace(/^grant execute on function[\\s\\S]*?;\\s*$/gm, '');
    await client.query(sql);
  }

  const stop = await client.query('select public.rewards_streamer_stop_round($1) as n', [secondary]);
  if (stop.rows[0].n !== 1) throw new Error('Secondary initial stop did not cancel one round');
  const primaryStatus = await client.query(
    "select count(*)::int as n from public.rewards_rounds where streamer_id=$1 and status='active'", [primary]);
  if (primaryStatus.rows[0].n !== 1) throw new Error('Primary round was modified');
  await client.query("insert into public.rewards_prizes(id,status) values ('10000000-0000-4000-8000-000000000003','available')");
  await client.query('update public.rewards_streamer_settings set enabled=true where streamer_id=$1', [secondary]);
  const started = await client.query('select public.rewards_streamer_start_round($1) as id', [secondary]);
  if (!started.rows[0]?.id) throw new Error('Secondary round not started');
  const secondStop = await client.query('select public.rewards_streamer_stop_round($1) as n', [secondary]);
  if (secondStop.rows[0].n !== 1) throw new Error('Secondary new round not cancelled');
  const active = await client.query(
    "select count(*)::int as n from public.rewards_rounds where streamer_id=$1 and status='active'", [secondary]);
  if (active.rows[0].n !== 0) throw new Error('Secondary active round remained');
  console.log('PASS: isolated secondary stop/start/stop; primary untouched; rollback pending');
} catch (error) {
  console.error('FAIL: isolated start/stop verification:', error.message);
  process.exitCode = 1;
} finally {
  if (begun) await client.query('ROLLBACK');
  client.release();
  await pool.end();
}
