// One-shot, explicitly enabled bootstrap for the isolated Render PostgreSQL.
// Never run on production. Does not expose any HTTP write endpoint.
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

const expected = 'd1psy_multistream_test_db';
if (process.env.ISOLATED_TEST_API !== 'true' ||
    process.env.BOOTSTRAP_ISOLATED_DB !== 'true' ||
    process.env.CONFIRM_TEST_DB_BOOTSTRAP !== expected) {
  throw new Error('Explicit isolated bootstrap confirmation required');
}
const url = process.env.DATABASE_URL;
if (!url || new URL(url).pathname.slice(1) !== expected) {
  throw new Error('Refusing unexpected database URL');
}
const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5000 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const { rows: [{ name }] } = await client.query('select current_database() as name');
  if (name !== expected) throw new Error('Database identity mismatch');
  await client.query('select pg_advisory_xact_lock(39780903)');
  const { rows: [{ count }] } = await client.query(
    "select count(*)::int as count from information_schema.tables where table_schema='public' and table_type='BASE TABLE'"
  );
  if (count !== 0) throw new Error('Refusing bootstrap: public schema is not empty');

  // Fixtures use psql-only meta commands and role setup for GitHub CI.
  // Render-managed Postgres does not need those roles for test-only SQL calls.
  let fixture = readFileSync('tests/sql/finalize_fixture.sql', 'utf8')
    .replace(/^\\set .*$/gm, '')
    .replace(/do \$\$ begin create role (?:anon|authenticated|service_role); exception when duplicate_object then null; end \$\$;/g, '');
  await client.query(fixture);

  let phase1 = readFileSync('migrations/20261103_multistream_phase1.sql', 'utf8');
  phase1 = phase1.slice(phase1.indexOf('create or replace function public.rewards_finalize_round('));
  if (!phase1.startsWith('create or replace function public.rewards_finalize_round(')) {
    throw new Error('Cannot locate real finalization function');
  }
  phase1 = phase1.replace(/^revoke all on function public\.rewards_finalize_round\(uuid\).*$/gm, '')
    .replace(/^grant execute on function public\.rewards_finalize_round\(uuid\).*$/gm, '');
  await client.query(phase1);
  await client.query(readFileSync('migrations/20261104_active_prize_guard_proposal.sql', 'utf8'));
  await client.query('COMMIT');
  console.log('Isolated disposable fixture bootstrapped successfully');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Isolated bootstrap failed:', error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
