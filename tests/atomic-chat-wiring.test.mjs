import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const engine=readFileSync('src/multistream-engine.ts','utf8');
const sql=readFileSync('migrations/20261104_atomic_chat_proposal.sql','utf8');
test('atomic chat RPC stays opt-in',()=>{
 assert.match(engine,/ATOMIC_CHAT_RPC_ENABLED==='true'/);
 assert.match(engine,/rewards_streamer_record_chat_atomic/);
});
test('atomic RPC failures throw instead of falling back to legacy inserts',()=>{
 const start=engine.indexOf("if(process.env.ATOMIC_CHAT_RPC_ENABLED==='true')");
 const end=engine.indexOf('const dedupId=',start);
 assert.ok(start>0&&end>start);
 const branch=engine.slice(start,end);
 assert.match(branch,/if\(error\)throw error/);
 assert.match(branch,/return;/);
 assert.doesNotMatch(branch,/rewards_event_dedup.*insert/);
});
test('atomic SQL requires streamer match and transaction-scoped dedup',()=>{
 assert.match(sql,/streamer_broadcaster_mismatch/);
 assert.match(sql,/on conflict \(event_id\) do nothing/);
 assert.match(sql,/rewards_record_chat_message/);
});
