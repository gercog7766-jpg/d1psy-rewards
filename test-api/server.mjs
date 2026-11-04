import { timingSafeEqual } from 'node:crypto';
// Isolated PostgreSQL test API. Never attach to production Supabase.
// This is deliberately NOT a replacement for the application's Supabase API.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { probeConfig, handleProbeRequest } from './twitch-probe.mjs';

const port = Number(process.env.PORT || 10000);
const url = process.env.DATABASE_URL;
const expectedName = 'd1psy_multistream_test_db';
if (process.env.ISOLATED_TEST_API !== 'true') {
  throw new Error('ISOLATED_TEST_API=true required');
}
if (!url) throw new Error('DATABASE_URL required');
const token = process.env.TEST_API_TOKEN;
if (!token || token.length < 32) throw new Error('TEST_API_TOKEN of at least 32 characters required');
const parsed = new URL(url);
if (parsed.pathname.replace(/^\//, '') !== expectedName) {
  throw new Error('Refusing database URL with unexpected database name');
}
if (process.env.BOOTSTRAP_ISOLATED_DB === 'true') {
  await import('./bootstrap.mjs');
  if (process.exitCode) throw new Error('Isolated bootstrap failed; refusing API startup');
}
if (process.env.VERIFY_ISOLATED_DB === 'true') {
  await import('./verify.mjs');
  if (process.exitCode) throw new Error('Isolated verification failed; refusing API startup');
}
if (process.env.VERIFY_START_STOP === 'true') {
  await import('./verify-start-stop.mjs');
  if (process.exitCode) throw new Error('Isolated start/stop verification failed; refusing API startup');
}
if (process.env.VERIFY_ATOMIC_CHAT === 'true') {
  await import('./verify-atomic-chat.mjs');
  if (process.exitCode) throw new Error('Isolated atomic chat verification failed; refusing API startup');
}
if (process.env.VERIFY_PRIZE_CONCURRENCY === 'true') {
  await import('./verify-prize-concurrency.mjs');
  if (process.exitCode) throw new Error('Isolated prize concurrency verification failed; refusing API startup');
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
  if (req.method === 'POST' && req.url === '/eventsub/twitch' && probeConfig(process.env)) {
    try { return await handleProbeRequest(req, res); }
    catch { return send(res, 503, { error: 'probe_unavailable' }); }
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'read_only' });
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if (pathname === '/test-dashboard') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff' });
    return res.end(readFileSync(new URL('./dashboard.html', import.meta.url)));
  }
  if (pathname === '/healthz') {
    try {
      await verify();
      return send(res, 200, { ok: true, isolated: true });
    } catch {
      return send(res, 503, { ok: false });
    }
  }
  if (pathname === '/api/test/rounds' || pathname === '/api/test/streamers' || pathname === '/api/test/overview' || pathname === '/api/test/twitch-probe-status') {
    const supplied = req.headers.authorization?.replace(/^Bearer /, '') || '';
    const a = Buffer.from(supplied);
    const b = Buffer.from(token);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return send(res, 401, { error: 'unauthorized' });
    try {
      if (pathname === '/api/test/twitch-probe-status') {
        return send(res, 200, {
          isolated: true,
          enabled: probeConfig(process.env),
          broadcaster: 'amych',
          broadcaster_id: '39780903',
          mode: 'read_only_acknowledgement',
          subscription_created_by_app: false,
          giveaway_processing: false
        });
      }
      if (pathname === '/api/test/rounds') {
        const result = await pool.query(
          'select id, streamer_id, prize_id, status, completion_reason from public.rewards_rounds order by id limit 100'
        );
        return send(res, 200, { rounds: result.rows });
      }
      const streamers = await pool.query(
        `select s.id, s.enabled, s.is_primary, st.enabled as giveaway_enabled,
                st.twitch_connection_status,
                count(r.id) filter (where r.status = 'active')::int as active_rounds
           from public.rewards_streamers s
           join public.rewards_streamer_settings st on st.streamer_id = s.id
           left join public.rewards_rounds r on r.streamer_id = s.id
          group by s.id, s.enabled, s.is_primary, st.enabled, st.twitch_connection_status
          order by s.is_primary desc, s.id limit 100`
      );
      if (pathname === '/api/test/streamers') return send(res, 200, { streamers: streamers.rows });
      const prizes = await pool.query(
        `select status, count(*)::int as count
           from public.rewards_prizes group by status order by status`
      );
      const rounds = await pool.query(
        `select streamer_id, status, count(*)::int as count
           from public.rewards_rounds group by streamer_id, status order by streamer_id, status`
      );
      return send(res, 200, { streamers: streamers.rows, prizes: prizes.rows, rounds: rounds.rows });
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
