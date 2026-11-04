import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {inspectSyntheticEventSub} from '../test-api/twitch-dry-run.mjs';
const secret='offline-test-secret';
const secondaryId='39780903';
function event(broadcaster=secondaryId,subscribed=broadcaster){
 const id=crypto.randomUUID(),timestamp=new Date().toISOString();
 const body=Buffer.from(JSON.stringify({subscription:{type:'channel.chat.message',condition:{broadcaster_user_id:subscribed}},event:{broadcaster_user_id:broadcaster,chatter_user_id:'12345',message_id:'msg-1'}}));
 const signature='sha256='+crypto.createHmac('sha256',secret).update(id+timestamp).update(body).digest('hex');
 return {id,timestamp,body,signature,secret,secondaryId};
}
test('signed secondary message is accepted only as a write-free dry run',()=>{
 assert.deepEqual(inspectSyntheticEventSub(event()),{accepted:true,broadcaster:secondaryId,route:'isolated_secondary_dry_run',writes:false});
});
test('primary channel and mismatched broadcaster are rejected',()=>{
 assert.equal(inspectSyntheticEventSub(event('511100980')).accepted,false);
 assert.equal(inspectSyntheticEventSub(event(secondaryId,'511100980')).accepted,false);
});
test('invalid signature and stale timestamp are rejected',()=>{
 const tampered=event();tampered.signature='sha256'+'0'.repeat(64);
 assert.equal(inspectSyntheticEventSub(tampered).reason,'signature_invalid');
 const stale=event();stale.timestamp=new Date(Date.now()-900000).toISOString();
 assert.equal(inspectSyntheticEventSub(stale).reason,'signature_invalid');
});
