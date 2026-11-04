import test from 'node:test';
import assert from 'node:assert/strict';
import { decideChatRoute } from '../src/chat-route-policy.mjs';
const primary='511100980', secondary='39780903';
const base={multistreamDbEnabled:false,pocIsolation:false,primaryBroadcasterId:primary,pocBroadcasterId:secondary,resolvedStreamer:false};
test('legacy primary is isolated from second and unknown channels',()=>{
 assert.equal(decideChatRoute({...base,broadcasterId:primary}),'primary');
 assert.equal(decideChatRoute({...base,broadcasterId:secondary}),'ignored');
 assert.equal(decideChatRoute({...base,broadcasterId:'99999999'}),'ignored');
});
test('missing primary ID fails closed instead of processing all broadcasters',()=>{
 assert.equal(decideChatRoute({...base,primaryBroadcasterId:'',broadcasterId:secondary}),'ignored');
});
test('PoC isolation accepts only the explicitly configured secondary',()=>{
 assert.equal(decideChatRoute({...base,pocIsolation:true,broadcasterId:secondary}),'poc');
 assert.equal(decideChatRoute({...base,pocIsolation:true,broadcasterId:primary}),'ignored');
});
test('DB routing accepts only enabled/resolved streamer',()=>{
 assert.equal(decideChatRoute({...base,multistreamDbEnabled:true,broadcasterId:primary,resolvedStreamer:true}),'streamer');
 assert.equal(decideChatRoute({...base,multistreamDbEnabled:true,broadcasterId:secondary,resolvedStreamer:true}),'streamer');
 assert.equal(decideChatRoute({...base,multistreamDbEnabled:true,broadcasterId:secondary,resolvedStreamer:false}),'ignored');
 assert.equal(decideChatRoute({...base,multistreamDbEnabled:true,broadcasterId:'',resolvedStreamer:true}),'ignored');
});
