// Isolated PostgreSQL test API. Never attach to production Supabase.
// This is deliberately NOT a replacement for the application's Supabase API.
import http from 'node:http';
import { Pool } from 'pg';

const port = Number(process.env.PORT || 10000);
const url = process.env.DATABASE_URL;
const expectedName = 'd1psy_multistream_test_db';
if (process.env.ISOLATED_TEST_API !== 'true') {
  throw new Error('ISOLATED_TEST_API=true required');
}
if (!url) throw new Error('DATABASE_URL required');
const parsed = new URL(url);
if (parsed.pathname.replace(/^\//, '') !== expectedName) {
  throw new Error('Refusing database URL with unexpected database name');
}
const pool = new Pool({ connectionString: url, max: 3, connectionTimeoutMillis: 5000 });
const verify = async () => {
  const result = await pool.query('select current_database() as name');
  if (result.rows[0]?.name !== expectedName) throw new Error('Database identity mismatch');
};
await verify();

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};
const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'read_only' });
  if (req.url === '/healthz') {
    try {
      await verify();
      return send(res, 200, { ok: true, isolated: true });
    } catch {
      return send(res, 503, { ok: false });
    }
  }
  if (req.url === '/api/test/rounds') {
    try {
      const result = await pool.query(
        'select id, streamer_id, prize_id, status, completion_reason from public.rewards_rounds order by id limit 100'
      );
      return send(res, 200, { rounds: result.rows });
    } catch {
      return send(res, 503, { error: 'test_schema_unavailable' });
    }
  }
  return send(res, 404, { error: 'not_found' });
});
server.listen(port, '0.0.0.0', () => {
  console.log('Isolated read-only PostgreSQL test API listening');
});
process.on('SIGTERM', () => {
  server.close();
  void pool.end();
});
