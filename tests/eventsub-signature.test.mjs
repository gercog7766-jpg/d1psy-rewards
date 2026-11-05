import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyEventSubMessage } from '../src/eventsub-signature.mjs';
const secret='fictional-webhook-test-secret';
const now=Date.parse('2026-11-04T12:00:00Z');
const timestamp=new Date(now).toISOString();
const id='fictional-message-id';
const body=Buffer.from(JSON.stringify({subscription:{type:'channel.chat.message'},event:{broadcaster_user_id:'39780903'}}));
const signature='sha256='+crypto.createHmac('sha256',secret).update(id+timestamp).update(body).digest('hex');
const valid={id,timestamp,signature,body,secret,now};
test('accept valid EventSub HMAC signature',()=>assert.equal(verifyEventSubMessage(valid),true));
test('reject tampered message body',()=>assert.equal(verifyEventSubMessage({...valid,body:Buffer.from('{}')}),false));
test('reject mismatched message ID',()=>assert.equal(verifyEventSubMessage({...valid,id:'other'}),false));
test('reject mismatched signature and secret',()=>{
 assert.equal(verifyEventSubMessage({...valid,signature:'sha256=0000'}),false);
 assert.equal(verifyEventSubMessage({...valid,secret:'other'}),false);
});
test('reject old, future and malformed timestamps',()=>{
 assert.equal(verifyEventSubMessage({...valid,now:now+600001}),false);
 assert.equal(verifyEventSubMessage({...valid,now:now-600001}),false);
 assert.equal(verifyEventSubMessage({...valid,timestamp:'not-a-date'}),false);
});
test('reject missing credentials and invalid body',()=>{
 assert.equal(verifyEventSubMessage({...valid,secret:''}),false);
 assert.equal(verifyEventSubMessage({...valid,body:'not a buffer'}),false);
 assert.equal(verifyEventSubMessage({...valid,signature:''}),false);
});
