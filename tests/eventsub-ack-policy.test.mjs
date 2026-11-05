import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const webhook=readFileSync('src/eventsub.ts','utf8');
const engine=readFileSync('src/multistream-engine.ts','utf8');
test('webhook delegates atomic and legacy acknowledgment to tested helper',()=>{
 assert.match(webhook,/return acknowledgeChat\(\{atomicEnabled:MULTISTREAM_DB_ENABLED&&process\.env\.ATOMIC_CHAT_RPC_ENABLED==='true'/);
 assert.match(webhook,/route:\(\)=>routeChat\(id,event,timestamp\)/);
 assert.match(webhook,/sendStatus:\(status:number\)=>res\.sendStatus\(status\)/);
});
test('atomic retries also resume post-commit round finalization',()=>{
 const start=engine.indexOf("if(process.env.ATOMIC_CHAT_RPC_ENABLED==='true')");
 const end=engine.indexOf('const dedupId=',start);
 assert.ok(start>0&&end>start);
 assert.match(engine.slice(start,end),/await checkStreamerRound\(streamer\)/);
});
