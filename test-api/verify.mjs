// Read-only verification of the isolated Render fixture and real finalization RPC.
// Uses a transaction that is ALWAYS rolled back: no test prize can be consumed.
import { Pool } from 'pg';
const expected = 'd1psy_multistream_test_db';
const url = process.env.DATABASE_URL;
if (process.env.ISOLATED_TEST_API !== 'true' || process.env.VERIFY_ISOLATED_DB !== 'true' ||
    !url || new URL(url).pathname.slice(1) !== expected) {
  throw new Error('Isolated verification guard failed');
}
const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5000 });
const client = await pool.connect();
let started = false;
try {
  await client.query('BEGIN');
  started = true;
  const db = await client.query('select current_database() as name');
  if (db.rows[0]?.name !== expected) throw new Error('Wrong database');
  const before = await client.query(
    "select count(*)::int as n from public.rewards_rounds where status='active'"
  );
  if (before.rows[0].n !== 2) throw new Error('Expected exactly two seeded active rounds');
  const result = await client.query(
    "select * from public.rewards_finalize_round($1::uuid)",
    ['20000000-0000-4000-8000-000000000001']
  );
  if (result.rows[0]?.completion_reason !== 'winner_selected') throw new Error('Primary finalization failed');
  const second = await client.query(
    "select * from public.rewards_finalize_round($1::uuid)",
    ['20000000-0000-4000-8000-000000000002']
  );
  if (second.rows[0]?.completion_reason !== 'winner_selected') throw new Error('Secondary finalization failed');
  const counts = await client.query(
    "select (select count(*)::int from public.rewards_wins) as wins, " +
    "(select count(*)::int from public.rewards_prizes where status='assigned') as assigned"
  );
  if (counts.rows[0].wins !== 2 || counts.rows[0].assigned !== 2) {
    throw new Error('Unexpected winner or prize state');
  }
  console.log('PASS: both isolated streamer finalizations, rollback pending');
} catch (error) {
  console.error('FAIL: isolated SQL verification:', error.message);
  process.exitCode = 1;
} finally {
  if (started) await client.query('ROLLBACK');
  client.release();
  await pool.end();
}
