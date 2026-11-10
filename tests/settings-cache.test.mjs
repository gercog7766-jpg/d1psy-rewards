import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {readSettings,updateSettings} from '../src/settings-cache.ts';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function fixture(){
 let row={id:true,enabled:false,twitch_connection_status:'disconnected',selected_prize_id:null},gets=0,writes=0,nextRead,nextWrite;
 const fetch=async(_url,options)=>{
  if(options.method==='PATCH'){writes++;const body=JSON.parse(options.body);if(nextWrite){const f=nextWrite;nextWrite=null;return f(body)}Object.assign(row,body);return new Response(null,{status:204});}
  gets++;const snapshot={...row};if(nextRead){const f=nextRead;nextRead=null;return f(snapshot)}return Response.json(snapshot);
 };
 const client=()=>createClient('https://test.supabase.co','test-secret',{auth:{persistSession:false},global:{fetch}});
 return {client,row,get gets(){return gets},get writes(){return writes},set nextRead(f){nextRead=f},set nextWrite(f){nextWrite=f}};
}
test('1000 overlapping settings polls share one successful read; callers receive isolated data',async()=>{
 const f=fixture(),db=f.client(),results=await Promise.all(Array.from({length:1000},()=>readSettings(db)));
 assert.equal(f.gets,1);results[0].data.enabled=true;assert.equal((await readSettings(db)).data.enabled,false);assert.equal(f.gets,1);
});
test('start, stop and Twitch writes invalidate cached settings across independent clients immediately',async()=>{
 const f=fixture(),engine=f.client(),web=f.client(),writer=f.client();
 await readSettings(engine);await readSettings(web);
 for(const change of [{enabled:true},{twitch_connection_status:'connected'},{enabled:false},{twitch_connection_status:'reconnecting'}]){
  assert.equal((await updateSettings(writer,change)).error,null);
  for(const db of [engine,web]){const {data}=await readSettings(db);for(const [k,v] of Object.entries(change))assert.equal(data[k],v);}
 }
 assert.equal(f.gets,10);assert.equal(f.writes,4);
});
test('an old in-flight read cannot repopulate settings after a completed write',async()=>{
 const f=fixture(),db=f.client(),gate=deferred(),started=deferred();
 f.nextRead=async snapshot=>{started.resolve();await gate.promise;return Response.json(snapshot)};
 const read=readSettings(db);await started.promise;await updateSettings(db,{enabled:true});gate.resolve();
 assert.equal((await read).data.enabled,true);assert.equal((await readSettings(db)).data.enabled,true);assert.equal(f.gets,2);
});
test('a read completed during a write is discarded when that write finishes',async()=>{
 const f=fixture(),db=f.client(),gate=deferred(),started=deferred();await readSettings(db);
 f.nextWrite=async body=>{started.resolve();await gate.promise;Object.assign(f.row,body);return new Response(null,{status:204})};
 const write=updateSettings(db,{enabled:true});await started.promise;assert.equal((await readSettings(db)).data.enabled,false);
 gate.resolve();await write;assert.equal((await readSettings(db)).data.enabled,true);
});
test('expiry refreshes external changes after 15 seconds; credentials/clients do not share values',async()=>{
 const f=fixture(),db=f.client(),other=fixture(),otherDb=other.client(),now=Date.now;let time=now();Date.now=()=>time;
 try{await readSettings(db);f.row.enabled=true;assert.equal((await readSettings(db)).data.enabled,false);time+=15001;assert.equal((await readSettings(db)).data.enabled,true);assert.equal(f.gets,2);assert.equal((await readSettings(otherDb)).data.enabled,false)}finally{Date.now=now}
});
test('database errors and missing settings are retried and never served as a successful stale fallback',async()=>{
 const f=fixture(),db=f.client();f.nextRead=()=>Response.json({message:'unavailable',code:'XX000'},{status:500});assert((await readSettings(db)).error);
 assert.equal((await readSettings(db)).data.enabled,false);assert.equal(f.gets,2);
 await updateSettings(db,{enabled:true});f.nextRead=()=>Response.json(null);assert.equal((await readSettings(db)).data,null);assert.equal((await readSettings(db)).data.enabled,true);assert.equal(f.gets,4);
});
test('failed writes also invalidate old values',async()=>{
 const f=fixture(),db=f.client();await readSettings(db);f.row.twitch_connection_status='error';
 f.nextWrite=()=>Response.json({message:'no write',code:'XX000'},{status:500});assert((await updateSettings(db,{enabled:true})).error);
 assert.equal((await readSettings(db)).data.twitch_connection_status,'error');assert.equal(f.gets,2);
});

test('full app: public OBS polls reuse settings, live round counts still change, start/stop invalidate immediately',{timeout:20000},async()=>{
 const {default:http}=await import('node:http');const {spawn}=await import('node:child_process');const {createHmac}=await import('node:crypto');
 const settings={id:true,enabled:false,twitch_connection_status:'connected'};let gets=0,count=0,active=false;
 const mock=http.createServer(async(q,r)=>{r.setHeader('Content-Type','application/json');const path=new URL(q.url,'http://test').pathname;let raw='';for await(const c of q)raw+=c;const body=raw?JSON.parse(raw):{};
  if(path.endsWith('/rewards_admins'))return r.end('{"twitch_user_id":"admin"}');
  if(path.endsWith('/rewards_settings')){if(q.method==='PATCH')Object.assign(settings,body);else gets++;return r.end(JSON.stringify(settings))}
  if(path.endsWith('/rewards_prizes'))return r.end('[{"id":"prize","name":"Test","sell_price_coins":5}]');
  if(path.endsWith('/rewards_rounds')){if(q.method==='POST'){active=true;return r.end(JSON.stringify({id:'round',...body}))}if(q.method==='PATCH'){active=false;return r.end('[]')}return r.end(JSON.stringify(active?{id:'round',message_count:++count,mode:'messages'}:null))}
  if(path.endsWith('/rewards_wins'))return r.end('null');r.end('[]');
 });await new Promise(r=>mock.listen(0,'127.0.0.1',r));const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const origin='http://127.0.0.1:'+port,child=spawn(process.execPath,['--import','tsx','src/server-entry.ts'],{env:{...process.env,PORT:String(port),APP_URL:origin,SESSION_SECRET:'settings-test',SUPABASE_URL:'http://127.0.0.1:'+mock.address().port,SUPABASE_SECRET_KEY:'test-key',REWARDS_ENGINE_ENABLED:'false',TWITCH_CLIENT_ID:''},stdio:'ignore'});
 try{
  for(let i=0;i<150;i++){try{await fetch(origin+'/health');break}catch{await new Promise(r=>setTimeout(r,50))}}
  const state=async()=>{const r=await fetch(origin+'/api/public/state');assert.equal(r.status,200);return r.json()};
  for(let i=0;i<20;i++)assert.equal((await state()).enabled,false);assert.equal(gets,1);
  const payload=Buffer.from(JSON.stringify({twitchUserId:'admin',exp:Date.now()+60000})).toString('base64url');const cookie='rewards_session='+payload+'.'+createHmac('sha256','settings-test').update(payload).digest('base64url');
  const post=path=>fetch(origin+path,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({mode:'messages',messageThreshold:100,minPrizeCoins:2,maxPrizeCoins:10})});
  assert.equal((await post('/api/admin/round/start')).status,201);assert.equal((await state()).enabled,true);const first=await state(),second=await state();assert(second.round.message_count>first.round.message_count);
  assert.equal((await post('/api/admin/round/stop')).status,200);const stopped=await state();assert.equal(stopped.enabled,false);assert.equal(stopped.round,null);
 }finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));await new Promise(r=>mock.close(r))}
});
