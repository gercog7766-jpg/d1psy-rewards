// Concurrent reservation and unique-active-prize checks against disposable Render PostgreSQL.
// Both sessions always roll back; production credentials and databases are refused.
import { Pool } from 'pg';
const expected = 'd1psy_multistream_test_db';
const url = process.env.DATABASE_URL;
if (process.env.ISOLATED_TEST_API !== 'true' || process.env.VERIFY_PRIZE_CONCURRENCY !== 'true' ||
    !url || new URL(url).pathname.slice(1) !== expected) throw new Error('Isolated concurrency guard failed');
const pool = new Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 5000 });
const a = await pool.connect();
const b = await pool.connect();
let txA = false, txB = false;
try {
  await a.query('BEGIN'); txA = true;
  await b.query('BEGIN'); txB = true;
  for (const client of [a, b]) {
    const { rows: [db] } = await client.query('select current_database() as name');
    if (db.name !== expected) throw new Error('Unexpected database');
  }
  const initial = await a.query(
    "select id, streamer_id, prize_id from public.rewards_rounds where status='active' order by streamer_id");
  if (initial.rows.length !== 2 || initial.rows[0].prize_id === initial.rows[1].prize_id)
    throw new Error('Expected two active rounds with different prizes');
  const index = await a.query(
    "select count(*)::int as n from pg_indexes where schemaname='public' and indexname='rewards_rounds_active_prize_unique_idx'");
  if (index.rows[0].n !== 1) throw new Error('Active prize unique index missing');

  // A holds the same prize row lock that start_round uses (FOR UPDATE SKIP LOCKED).
  await a.query('select id from public.rewards_prizes where id=$1 for update', [initial.rows[0].prize_id]);
  await b.query("set local lock_timeout = '750ms'");
  let lockRejected = false;
  try {
    await b.query('select id from public.rewards_prizes where id=$1 for update', [initial.rows[0].prize_id]);
  } catch (error) {
    lockRejected = error.code === '55P03';
  }
  if (!lockRejected) throw new Error('Concurrent lock was not rejected by timeout');
  await b.query('ROLLBACK'); txB = false;
  await b.query('BEGIN'); txB = true;

  // A separate active round cannot take the same limited prize.
  let duplicateRejected = false;
  try {
    await b.query('update public.rewards_rounds set prize_id=$1 where id=$2',
      [initial.rows[0].prize_id, initial.rows[1].id]);
  } catch (error) {
    duplicateRejected = error.code === '23505';
  }
  if (!duplicateRejected) throw new Error('Duplicate active prize was not rejected');
  await b.query('ROLLBACK'); txB = false;
  await a.query('ROLLBACK'); txA = false;

  const after = await a.query(
    "select id, streamer_id, prize_id from public.rewards_rounds where status='active' order by streamer_id");
  if (JSON.stringify(after.rows) !== JSON.stringify(initial.rows))
    throw new Error('Round state changed after rollback');
  console.log('PASS: isolated prize row lock contention and unique active-prize guard; both rounds unchanged');
} catch (error) {
  console.error('FAIL: isolated prize concurrency:', error.message);
  process.exitCode = 1;
} finally {
  if (txB) await b.query('ROLLBACK').catch(() => {});
  if (txA) await a.query('ROLLBACK').catch(() => {});
  a.release(); b.release();
  await pool.end();
}
