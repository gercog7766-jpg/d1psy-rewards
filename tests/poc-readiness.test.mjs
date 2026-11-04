import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPocEnvironment} from '../scripts/check-poc-readiness.mjs';
const base={
 APP_URL:'https://d1psy-rewards-multistream-test.onrender.com',
 TWITCH_REDIRECT_URI:'https://d1psy-rewards-multistream-test.onrender.com/auth/twitch/callback',
 TWITCH_POC_ROUTES_ENABLED:'true',TWITCH_POC_ISOLATION:'true',
 MULTISTREAM_DB_ENABLED:'false',TWITCH_POC_LOGIN:'amych',
 TWITCH_POC_BROADCASTER_ID:'39780903',
 TWITCH_CLIENT_ID:'placeholder',TWITCH_CLIENT_SECRET:'placeholder',TWITCH_EVENTSUB_SECRET:'placeholder',
 SUPABASE_URL:'https://isolated-example.supabase.co',SUPABASE_SECRET_KEY:'placeholder'
};
test('preflight passes only for explicitly isolated secondary setup',()=>{
 const result=inspectPocEnvironment(base);
 assert.equal(result.ready,true,JSON.stringify(result.checks));
});
test('preflight rejects production database even when OAuth flags look safe',()=>{
 const result=inspectPocEnvironment({...base,SUPABASE_URL:'https://ssqjogdcynmjjgtxknng.supabase.co'});
 assert.equal(result.ready,false);
 assert.equal(result.checks.production_supabase_not_used,false);
});
test('preflight rejects production callback, missing credentials and dangerous flags',()=>{
 for(const overrides of [
  {APP_URL:'https://d1psy-rewards.onrender.com'},
  {TWITCH_REDIRECT_URI:'https://d1psy-rewards.onrender.com/auth/twitch/callback'},
  {TWITCH_POC_ISOLATION:'false'},
  {MULTISTREAM_DB_ENABLED:'true'},
  {ATOMIC_CHAT_RPC_ENABLED:'true'},
  {ENABLE_GIVEAWAYS:'true'},
  {TWITCH_POC_BROADCASTER_ID:'511100980'},
  {TWITCH_CLIENT_SECRET:''}
 ]){
  assert.equal(inspectPocEnvironment({...base,...overrides}).ready,false,JSON.stringify(overrides));
 }
});
test('readiness report never includes credential values',()=>{
 const result=JSON.stringify(inspectPocEnvironment({...base,TWITCH_CLIENT_SECRET:'super-secret-value'}));
 assert.equal(result.includes('super-secret-value'),false);
});
