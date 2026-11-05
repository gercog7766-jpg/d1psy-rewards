import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const db=process.env.DATABASE_URL;
const enabled=process.env.ISOLATED_TEST_API==='true'&&process.env.VERIFY_SHARED_TWITCH_HTTP==='true'&&db&&new URL(db).pathname==='/d1psy_multistream_test_db';

test('shared free API accepts signed synthetic amych EventSub without changing dashboard', {skip:!enabled},async()=>{
 const port=18767;
 const secret='synthetic-shared-api-secret-1234567890123456789';
 const child=spawn(process.execPath,['test-api/server.mjs'],{
  env:{...process.env,PORT:String(port),TWITCH_PROBE_ENABLED:'true',
   TWITCH_PROBE_BROADCASTER_ID:'39780903',TWITCH_PROBE_SECRET:secret,
   ENABLE_GIVEAWAYS:'false',MULTISTREAM_DB_ENABLED:'false',
   ATOMIC_CHAT_RPC_ENABLED:'false',BOOTSTRAP_ISOLATED_DB:'false',
   VERIFY_ATOMIC_CHAT:'false',VERIFY_ISOLATED_DB:'false',
   VERIFY_START_STOP:'false',VERIFY_PRIZE_CONCURRENCY:'false'},
  stdio:['ignore','pipe','pipe']
 });
 let output='';
 child.stdout.on('data',d=>{output+=d.toString();});
 child.stderr.on('data',d=>{output+=d.toString();});
 const base='http://127.0.0.1:'+port;
 const send=async(type,payload,signingSecret=secret)=>{
  const id=crypto.randomUUID(),timestamp=new Date().toISOString(),body=JSON.stringify(payload);
  const signature='sha256='+crypto.createHmac('sha256',signingSecret).update(id+timestamp+body).digest('hex');
  return fetch(base+'/eventsub/twitch',{method:'POST',headers:{
   'Twitch-Eventsub-Message-Id':id,
   'Twitch-Eventsub-Message-Timestamp':timestamp,
   'Twitch-Eventsub-Message-Signature':signature,
   'Twitch-Eventsub-Message-Type':type,
   'Content-Type':'application/json'},body});
 };
 try{
  let ready=false;
  for(let i=0;i<60;i++){
   if(child.exitCode!==null)break;
   try{const r=await fetch(base+'/healthz');if(r.ok){ready=true;break;}}catch{}
   await delay(200);
  }
  assert.ok(ready,'isolated API did not start: '+output.slice(-1000));
  assert.equal((await fetch(base+'/test-dashboard')).status,200);
  assert.equal((await fetch(base+'/api/test/rounds')).status,401);
  const challenge=await send('webhook_callback_verification',{
   subscription:{type:'channel.chat.message',condition:{broadcaster_user_id:'39780903'}},
   challenge:'synthetic-only-challenge'
  });
  assert.equal(challenge.status,200);
  assert.equal(await challenge.text(),'synthetic-only-challenge');
  const notification=broadcaster=>({
   subscription:{type:'channel.chat.message',condition:{broadcaster_user_id:broadcaster}},
   event:{broadcaster_user_id:broadcaster,chatter_user_id:'1001',message_id:'synthetic-1'}
  });
  assert.equal((await send('notification',notification('39780903'))).status,204);
  assert.equal((await send('notification',notification('511100980'))).status,403);
  assert.equal((await send('notification',notification('39780903'),'invalid-secret')).status,403);
  assert.equal((await fetch(base+'/test-dashboard')).status,200);
 }finally{
  child.kill('SIGTERM');
  await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(3000)]);
  if(child.exitCode===null)child.kill('SIGKILL');
 }
});
