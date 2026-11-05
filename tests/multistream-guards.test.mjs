import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync(new URL('../src/streamer-dashboard.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../src/server-next.ts', import.meta.url), 'utf8');

test('streamer dashboard requires authenticated session for all routes', () => {
  for (const route of [
    "app.get('/streamer/dashboard', requireUser",
    "app.get('/api/streamer/dashboard', requireUser",
    "app.put('/api/streamer/settings', requireUser",
    "app.post('/api/streamer/round/:action', requireUser"
  ]) assert.ok(dashboard.includes(route), 'missing session guard: ' + route);
});

test('streamer identity is derived from verified session, not request body', () => {
  assert.match(dashboard, /eq\('twitch_broadcaster_id', session\.twitchUserId\)/);
  assert.doesNotMatch(dashboard, /req\.(body|query|params)\.streamerId/);
});

test('round writes require a separate feature flag', () => {
  assert.match(dashboard, /STREAMER_ROUND_WRITES_ENABLED/);
  assert.match(dashboard, /atomic_round_controls_not_ready/);
});

test('round cancellation and active-round checks are streamer-scoped', () => {
  assert.match(dashboard, /eq\('streamer_id', streamer\.id\)\.eq\('status', 'active'\)/);
});

test('existing legacy round routes are retained during development', () => {
  assert.ok(server.includes("app.post('/api/admin/round/start'"));
  assert.ok(server.includes("app.post('/api/admin/round/stop'"));
  assert.ok(server.includes('installStreamerDashboard(app, requireUser)'));
});

test('round controls use transactional RPCs rather than separate round writes', () => {
  assert.match(dashboard, /db\.rpc\('rewards_streamer_start_round'/);
  assert.match(dashboard, /db\.rpc\('rewards_streamer_stop_round'/);
  assert.doesNotMatch(dashboard, /db\.from\('rewards_rounds'\)\s*\.insert/);
});

test('legacy engine only reads migrated primary streamer rounds', () => {
  const legacy = readFileSync(new URL('../src/engine.ts', import.meta.url), 'utf8');
  assert.match(legacy, /eq\('is_primary',true\)/);
  assert.match(legacy, /eq\('streamer_id',primaryId\)\.eq\('status','active'\)/);
});
test('admin and public state and stop scope to migrated primary ID', () => {
  assert.match(server, /eq\('is_primary',true\)/);
  assert.match(server, /eq\('status','active'\)\.eq\('streamer_id',primaryId\)\.maybeSingle\(\)/);
  assert.match(server, /eq\('status','active'\)\.eq\('streamer_id',primaryId\);if\(stopError\)/);
});
test('automatic multi-stream engine uses transactional prize reservation', () => {
  const engine = readFileSync(new URL('../src/multistream-engine.ts', import.meta.url), 'utf8');
  assert.match(engine, /db\.rpc\('rewards_streamer_start_round'/);
  assert.doesNotMatch(engine, /db\.from\('rewards_rounds'\)\.insert/);
});

test('legacy automatic and admin starts use atomic reservation RPC', () => {
  const legacy = readFileSync(new URL('../src/engine.ts', import.meta.url), 'utf8');
  assert.match(legacy, /db\.rpc\('rewards_legacy_start_round'/);
  assert.match(server, /db\.rpc\('rewards_legacy_start_round'/);
  assert.doesNotMatch(legacy, /db\.from\('rewards_rounds'\)\.insert/);
});
