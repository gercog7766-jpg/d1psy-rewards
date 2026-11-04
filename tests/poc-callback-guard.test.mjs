import test from 'node:test';
import assert from 'node:assert/strict';
import {isolatedCallbackUrl} from '../src/poc-callback-guard.mjs';
test('secondary EventSub callback is restricted to the dedicated PoC host',()=>{
 assert.equal(isolatedCallbackUrl('https://d1psy-rewards-multistream-test.onrender.com/'),'https://d1psy-rewards-multistream-test.onrender.com/eventsub/twitch');
 for(const value of ['https://d1psy-rewards.onrender.com/','https://d1psy-multistream-isolated-api.onrender.com/','http://d1psy-rewards-multistream-test.onrender.com/','https://evil.example/','https://d1psy-rewards-multistream-test.onrender.com/other','https://d1psy-rewards-multistream-test.onrender.com/?x=1']){
  assert.equal(isolatedCallbackUrl(value),null,value);
 }
});
