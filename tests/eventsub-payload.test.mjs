import test from 'node:test';
import assert from 'node:assert/strict';
import { validChatNotification } from '../src/eventsub-payload.mjs';
const valid={subscription:{type:'channel.chat.message',condition:{broadcaster_user_id:'39780903'}},event:{broadcaster_user_id:'39780903',chatter_user_id:'123'}};
test('accept matching secondary broadcaster',()=>assert.equal(validChatNotification(valid),true));
test('reject broadcaster mismatch even with valid event type',()=>assert.equal(validChatNotification({...valid,event:{...valid.event,broadcaster_user_id:'511100980'}}),false));
test('reject missing condition or chatter',()=>{
 assert.equal(validChatNotification({...valid,subscription:{type:'channel.chat.message'}}),false);
 assert.equal(validChatNotification({...valid,event:{broadcaster_user_id:'39780903'}}),false);
 assert.equal(validChatNotification(null),false);
});
test('reject non-chat event',()=>assert.equal(validChatNotification({...valid,subscription:{...valid.subscription,type:'stream.online'}}),false));
