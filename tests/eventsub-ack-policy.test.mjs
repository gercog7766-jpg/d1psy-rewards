import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const webhook=readFileSync('src/eventsub.ts','utf8');
const engine=readFileSync('src/multistream-engine.ts','utf8');
test('atomic multistream webhook waits for durable processing before 204',()=>{
 const i=webhook.indexOf("if(MULTISTREAM_DB_ENABLED&&process.env.ATOMIC_CHAT_RPC_ENABLED==='true')");
 assert.ok(i>0);
 const path=webhook.slice(i,i+180);
 assert.match(path,/await routeChat\(id,event,timestamp\);return res\.sendStatus\(204\)/);
});
test('legacy and POC webhook behavior stays behind atomic opt-in',()=>{
 assert.match(webhook,/res\.sendStatus\(204\);void routeChat\(id,event,timestamp\)\.catch/);
});
test('atomic retries also resume post-commit round finalization',()=>{
 const start=engine.indexOf("if(process.env.ATOMIC_CHAT_RPC_ENABLED==='true')");
 const end=engine.indexOf('const dedupId=',start);
 assert.ok(start>0&&end>start);
 assert.match(engine.slice(start,end),/await checkStreamerRound\(streamer\)/);
 assert.doesNotMatch(engine.slice(start,end),/if\(data===true\)await checkStreamerRound/);
});
