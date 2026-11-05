import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatSimulation,STREAMS} from '../test-api/isolated-chat-simulation.mjs';

test('independent volatile rounds, duplicate protection and thresholds',()=>{
 const simulation=createChatSimulation({threshold:2});
 assert.equal(simulation.record({broadcasterId:STREAMS.amych,messageId:'a'}),true);
 assert.equal(simulation.record({broadcasterId:STREAMS.amych,messageId:'a'}),false);
 assert.equal(simulation.record({broadcasterId:STREAMS.d1psy_off,messageId:'a'}),true);
 let snapshot=simulation.snapshot();
 assert.equal(snapshot.database_writes,false);
 assert.equal(snapshot.giveaway_processing,false);
 assert.deepEqual(snapshot.streams.map(s=>s.progress),[1,1]);
 assert.equal(simulation.record({broadcasterId:STREAMS.amych,messageId:'b'}),true);
 snapshot=simulation.snapshot();
 const primary=snapshot.streams.find(s=>s.login==='d1psy_off');
 const secondary=snapshot.streams.find(s=>s.login==='amych');
 assert.equal(primary.round,1);assert.equal(primary.progress,1);
 assert.equal(secondary.round,2);assert.equal(secondary.progress,0);assert.equal(secondary.completed,1);
 assert.equal(simulation.record({broadcasterId:'unknown',messageId:'c'}),false);
 assert.equal(simulation.record({broadcasterId:STREAMS.d1psy_off,messageId:''}),false);
});
