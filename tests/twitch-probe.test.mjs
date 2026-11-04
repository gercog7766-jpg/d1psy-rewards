import test from 'node:test';
import assert from 'node:assert/strict';
import {probeConfig} from '../test-api/twitch-probe.mjs';
const base={
 ISOLATED_TEST_API:'true',TWITCH_PROBE_ENABLED:'true',
 DATABASE_URL:'postgresql://postgres:placeholder@localhost/d1psy_multistream_test_db',
 TWITCH_PROBE_BROADCASTER_ID:'39780903',
 TWITCH_PROBE_SECRET:'x'.repeat(32)
};
test('probe is disabled unless explicitly isolated',()=>{
 assert.equal(probeConfig(base),true);
 for(const override of [
  {ISOLATED_TEST_API:'false'}, {TWITCH_PROBE_ENABLED:'false'},
  {DATABASE_URL:'postgresql://postgres:placeholder@localhost/production'},
  {TWITCH_PROBE_BROADCASTER_ID:'511100980'},
  {TWITCH_PROBE_SECRET:'short'},
  {ENABLE_GIVEAWAYS:'true'},
  {MULTISTREAM_DB_ENABLED:'true'},
  {ATOMIC_CHAT_RPC_ENABLED:'true'}
 ])assert.equal(probeConfig({...base,...override}),false,JSON.stringify(override));
});
