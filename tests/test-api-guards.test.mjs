import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const api = readFileSync(new URL('../test-api/server.mjs', import.meta.url), 'utf8');
test('isolated test API cannot silently target another database', () => {
  assert.match(api, /ISOLATED_TEST_API/);
  assert.match(api, /d1psy_multistream_test_db/);
  assert.match(api, /current_database\(\)/);
});
test('legacy inspection API remains read-only and token-protected outside the opt-in streamer dashboard', () => {
  assert.match(api, /req\.method !== 'GET'/);
  assert.match(api, /TEST_API_TOKEN/);
  assert.match(api, /timingSafeEqual/);
  assert.doesNotMatch(api, /SUPABASE_SECRET_KEY|ssqjogdcynmjjgtxknng/);
});
