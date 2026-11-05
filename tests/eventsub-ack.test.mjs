import test from 'node:test';
import assert from 'node:assert/strict';
import {acknowledgeChat} from '../src/eventsub-ack.mjs';
test('atomic success sends 204 after route resolves',async()=>{
 const statuses=[];let release;
 const pending=new Promise(resolve=>{release=resolve});
 const done=acknowledgeChat({atomicEnabled:true,route:()=>pending,sendStatus:s=>statuses.push(s),onLegacyError:()=>{}});
 assert.deepEqual(statuses,[]);release();await done;assert.deepEqual(statuses,[204]);
});
test('atomic failure sends 500, never 204',async()=>{
 const statuses=[];const old=console.error;console.error=()=>{};
 try{await acknowledgeChat({atomicEnabled:true,route:async()=>{throw Error('db offline')},sendStatus:s=>statuses.push(s),onLegacyError:()=>{}});}
 finally{console.error=old;}
 assert.deepEqual(statuses,[500]);
});
test('legacy path acknowledges immediately, then runs asynchronously',async()=>{
 const statuses=[];let routed=false;
 await acknowledgeChat({atomicEnabled:false,route:async()=>{routed=true},sendStatus:s=>statuses.push(s),onLegacyError:()=>{}});
 assert.deepEqual(statuses,[204]);assert.equal(routed,true);
});
