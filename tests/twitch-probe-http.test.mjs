import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {once} from 'node:events';
import {startProbe} from '../test-api/twitch-probe.mjs';

// The probe must only connect to disposable PostgreSQL created by GitHub CI.
const db=process.env.DATABASE_URL;
const enabled=process.env.ISOLATED_TEST_API==='true'&&process.env.VERIFY_TWITCH_PROBE_HTTP==='true'&&db&&new URL(db).pathname==='/d1psy_multistream_test_db';
test('isolated Twitch probe HTTP signed challenge, notifications and rejection', {skip:!enabled},async()=>{
 const secret='test-only-eventsub-signing-secret-at-least-32';
 const env={
  ...process.env,PORT:'0',DATABASE_URL:db,ISOLATED_TEST_API:'true',
  TWITCH_PROBE_ENABLED:'true',TWITCH_PROBE_BROADCASTER_ID:'39780903',
  TWITCH_PROBE_SECRET:secret,MULTISTREAM_DB_ENABLED:'false',
  ATOMIC_CHAT_RPC_ENABLED:'false',ENABLE_GIVEAWAYS:'false'
 };
 const server=await startProbe(env);
 await once(server,'listening');
 const port=server.address().port;
 const send=async(type,payload,signingSecret=secret)=>{
  const id=crypto.randomUUID(),timestamp=new Date().toISOString();
  const body=JSON.stringify(payload);
  const signature='sha256='+crypto.createHmac('sha256',signingSecret).update(id+timestamp+body).digest('hex');
  return fetch('http://127.0.0.1:'+port+'/eventsub/twitch',{method:'POST',headers:{
   'Twitch-Eventsub-Message-Id':id,'Twitch-Eventsub-Message-Timestamp':timestamp,
   'Twitch-Eventsub-Message-Signature':signature,'Twitch-Eventsub-Message-Type':type,
   'Content-Type':'application/json'
  },body});
 };
 const notification=(broadcaster,subscribed=broadcaster)=>({
  subscription:{type:'channel.chat.message',condition:{broadcaster_user_id:subscribed}},
  event:{broadcaster_user_id:broadcaster,chatter_user_id:'1001',message_id:'synthetic-1'}
 });
 try{
  const health=await fetch('http://127.0.0.1:'+port+'/healthz');
  assert.equal(health.status,200);
  const challenge=await send('webhook_callback_verification',{
   subscription:{type:'channel.chat.message',condition:{broadcaster_user_id:'39780903'}},challenge:'offline-challenge'
  });
  assert.equal(challenge.status,200);
  assert.equal(await challenge.text(),'offline-challenge');
  assert.equal((await send('notification',notification('39780903'))).status,204);
  assert.equal((await send('notification',notification('39780903'))).status,204); // repeated delivery is harmless: probe never writes
  assert.equal((await send('webhook_callback_verification',{subscription:{type:'channel.follow',condition:{broadcaster_user_id:'39780903'}},challenge:'invalid-type'})).status,403);
  assert.equal((await send('webhook_callback_verification',{subscription:{type:'channel.chat.message',condition:{broadcaster_user_id:'39780903'}},challenge:''})).status,403);
  assert.equal((await send('notification',notification('511100980'))).status,403);
  assert.equal((await send('notification',notification('39780903','511100980'))).status,400);
  assert.equal((await send('notification',notification('39780903'),'incorrect-signing-secret')).status,403);
  const wrongChallenge=await send('webhook_callback_verification',{
   subscription:{type:'channel.chat.message',condition:{broadcaster_user_id:'511100980'}},challenge:'wrong'
  });
  assert.equal(wrongChallenge.status,403);
  const check=await fetch('http://127.0.0.1:'+port+'/eventsub/twitch');
  assert.equal(check.status,404);
 }finally{
  server.closeAllConnections();
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});
