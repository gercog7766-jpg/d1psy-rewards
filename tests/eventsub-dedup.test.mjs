import test from 'node:test';
import assert from 'node:assert/strict';
import { chatDedupKey, isDuplicateInsertError } from '../src/eventsub-dedup.mjs';
test('same Twitch delivery maps to same dedup key',()=>{
 assert.equal(chatDedupKey('39780903','delivery-1'),chatDedupKey('39780903','delivery-1'));
});
test('same delivery ID across channels never shares dedup key',()=>{
 assert.notEqual(chatDedupKey('39780903','delivery-1'),chatDedupKey('511100980','delivery-1'));
});
test('distinct deliveries on same channel stay distinct',()=>{
 assert.notEqual(chatDedupKey('39780903','delivery-1'),chatDedupKey('39780903','delivery-2'));
});
test('missing or malformed IDs are rejected',()=>{
 for(const id of ['', 'abc', '3978:1']) assert.throws(()=>chatDedupKey(id,'delivery-1'),/invalid_broadcaster_id/);
 for(const id of ['', '  ', 'x'.repeat(257)]) assert.throws(()=>chatDedupKey('39780903',id),/invalid_message_id/);
});
test('only unique violation is a duplicate',()=>{
 assert.equal(isDuplicateInsertError({code:'23505'}),true);
 assert.equal(isDuplicateInsertError({code:'23503'}),false);
 assert.equal(isDuplicateInsertError({code:'PGRST301'}),false);
 assert.equal(isDuplicateInsertError(null),false);
});
