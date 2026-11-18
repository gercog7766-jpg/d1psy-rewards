import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import {JSDOM} from 'jsdom';
import {spawn} from 'node:child_process';
import {createHmac} from 'node:crypto';
import {installAdminStatistics,summarizeBids,summarizeHolds} from '../src/admin-statistics.ts';
import {adminStatisticsHtml,adminStatisticsJs} from '../src/admin-statistics-ui.ts';

test('auction statistics report refunded bids separately from actual spending and pending reserves',()=>{
 const bids=[{id:1,user_id:'a',amount:10,player:null},{id:2,user_id:'b',amount:20,player:null},{id:3,user_id:'a',amount:30,player:null}];
 const closed=summarizeBids(bids,{winner_id:'a',high_bid:30,closed_at:'2026-11-18'});
 assert.deepEqual(closed.map(p=>[p.userId,p.bids,p.highest,p.spent,p.reserved,p.won]),[['a',2,30,30,0,true],['b',1,20,0,0,false]]);
 const active=summarizeBids(bids,{winner_id:'a',high_bid:30,closed_at:null});
 assert.equal(active[0].spent,0);assert.equal(active[0].reserved,30);assert.equal(active[0].won,false);
});

test('button statistics sum separate holds and clamp unfinished intervals to the round deadline',()=>{
 const stamp=seconds=>new Date(Date.UTC(2026,10,18,0,0,seconds)).toISOString();
 const hold=(id,user,start,end)=>({request_id:id,user_id:user,player:null,started_at:stamp(start),ended_at:end===null?null:stamp(end)});
 const result=summarizeHolds([hold('1','a',0,10),hold('2','b',10,25),hold('3','a',25,null)],stamp(40),stamp(80));
 assert.deepEqual(result.players.map(p=>[p.userId,p.presses,p.totalMs,p.bestMs]),[['a',2,25000,15000],['b',1,15000,15000]]);
 assert.equal(summarizeHolds([hold('4','a',30,null)],stamp(40),stamp(35)).players[0].totalMs,5000);
});

test('admin-only report reads complete round histories beyond 1000 rows, validates filters and returns failures',async()=>{
 const round='00000000-0000-4000-8000-000000000001',calls=[];
 const bids=Array.from({length:1001},(_,i)=>({id:i+1,user_id:i%2?'b':'a',amount:i+1,player:{twitch_login:i%2?'bob':'alice'}}));
 let fail=false;
 const db={from(table){
  const entry={table,filters:[]};calls.push(entry);
  const query={select(columns){entry.columns=columns;return this},eq(key,value){entry.filters.push([key,value]);return this},order(){return this},gte(){return this},lt(){return this},lte(){return this},range(from,to){entry.range=[from,to];return this},then(resolve,reject){
   const rows=table==='rewards_black_boxes'?[{id:round,winner_id:'a',high_bid:1001,closed_at:'2026-11-18'}]:table==='rewards_black_box_bids'?bids:[];
   return Promise.resolve({data:rows.slice(entry.range[0],entry.range[1]+1),count:rows.length,error:fail?{code:'PGRST'}:null}).then(resolve,reject);
  }};return query;
 }};
 const app=express();installAdminStatistics(app,db,(q,r,next)=>q.get('x-role')==='admin'?next():r.sendStatus(q.get('x-role')?403:401));
 const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const get=path=>fetch(base+path,{headers:{'x-role':'admin'}});
 try{
  for(const path of ['/admin/statistics','/admin/statistics.js','/api/admin/statistics/black-box']){
   assert.equal((await fetch(base+path)).status,401);
   assert.equal((await fetch(base+path,{headers:{'x-role':'viewer'}})).status,403);
  }
  assert.equal(calls.length,0);
  for(const query of ['round=bad','page=0','from=bad','from=2026-11-19T00:00:00Z&to=2026-11-18T00:00:00Z'])assert.equal((await get('/api/admin/statistics/black-box?'+query)).status,400);
  assert.equal((await get('/api/admin/statistics/upgrades?sort=bad')).status,400);
  const response=await get('/api/admin/statistics/black-box?round='+round);
  assert.match(response.headers.get('cache-control'),/no-store/);
  const data=await response.json();assert.equal(data.history.length,1001);
  assert.equal(data.players.find(p=>p.userId==='a').bids,501);
  assert.equal(data.players.find(p=>p.userId==='a').spent,1001);
  assert.deepEqual(calls.filter(c=>c.table==='rewards_black_box_bids').map(c=>c.range),[[0,499],[500,999],[1000,1000]]);
  fail=true;assert.equal((await get('/api/admin/statistics/upgrades')).status,503);
 }finally{await new Promise(r=>server.close(r))}
});

test('statistics UI renders player names safely and refreshes closed auction results',async()=>{
 const dom=new JSDOM(adminStatisticsHtml,{url:'https://example.test/admin/statistics',runScripts:'outside-only'}),w=dom.window;
 const round='00000000-0000-4000-8000-000000000001';
 w.AbortSignal=AbortSignal;w.HTMLElement.prototype.scrollIntoView=function(){};
 w.fetch=async url=>{
  const parsed=new URL(url,'https://example.test');
  const data=parsed.searchParams.has('round')?{round:{starts_at:new Date().toISOString(),ends_at:new Date().toISOString(),closed_at:new Date().toISOString(),winner_id:'a',high_bid:30,prize_name:'Skin'},asOf:new Date().toISOString(),players:[{userId:'a',login:'alice',name:'<img onerror=bad>',bids:2,highest:30,spent:30,reserved:0,won:true}],history:[{login:'alice',name:'<img onerror=bad>',amount:30}]}:parsed.pathname.endsWith('black-box')?{rows:[{id:round,prize_name:'Skin'}],total:1}:{rows:[],total:0};
  return Response.json(data);
 };
 const wait=()=>new Promise(r=>setTimeout(r,25));
 try{
  w.eval(adminStatisticsJs);await wait();
  w.document.getElementById('tab-black-box').click();await wait();
  w.document.querySelector('#rows button').click();await wait();
  assert.equal(w.document.getElementById('detail').hidden,false);
  assert(w.document.getElementById('players').textContent.includes('<img onerror=bad>'));
  assert.equal(w.document.querySelector('#players img'),null);
  assert(w.document.getElementById('detailSummary').textContent.includes('Выигрыш: Skin'));
  assert(w.document.getElementById('historyNote').textContent.includes('возвращаются'));
 }finally{w.close()}
});

test('real admin dashboard links to reports and signed sessions enforce administrator access',async()=>{
 const mock=http.createServer((q,r)=>{
  r.setHeader('Content-Type','application/json');
  const url=new URL(q.url,'http://mock');
  if(url.pathname.endsWith('/rewards_admins'))return r.end(url.searchParams.get('twitch_user_id')==='eq.owner'?'{"twitch_user_id":"owner"}':'null');
  if(url.pathname.endsWith('/rewards_upgrades')){r.setHeader('Content-Range','0-0/1');return r.end('[{"id":"upgrade","result":"won","target_value_coins":100,"player":{"twitch_login":"alice"}}]')}
  r.end('[]');
 });
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const origin='http://127.0.0.1:'+port,secret='admin-statistics-test';
 const child=spawn(process.execPath,['--import','tsx','src/server-entry.ts'],{env:{...process.env,PORT:String(port),APP_URL:origin,SUPABASE_URL:'http://127.0.0.1:'+mock.address().port,SUPABASE_SECRET_KEY:'test',SESSION_SECRET:secret,REWARDS_ENGINE_ENABLED:'false',TWITCH_CLIENT_ID:'',TWITCH_CLIENT_SECRET:'',TWITCH_EVENTSUB_SECRET:''},stdio:'ignore'});
 const headers=actor=>{const payload=Buffer.from(JSON.stringify({twitchUserId:actor,exp:Date.now()+60000})).toString('base64url');return {Cookie:'rewards_session='+payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url')}};
 try{
  let ready=false;
  for(let attempt=0;attempt<120;attempt++){
   try{if((await fetch(origin+'/health')).ok){ready=true;break}}catch{}
   await new Promise(r=>setTimeout(r,50));
  }
  assert(ready);
  const html=await(await fetch(origin+'/admin',{headers:headers('owner')})).text();
  assert(html.includes('id="adminStatisticsLink"'));
  assert.equal((await fetch(origin+'/admin/statistics')).status,401);
  assert.equal((await fetch(origin+'/admin/statistics',{headers:headers('viewer')})).status,403);
  const page=await fetch(origin+'/admin/statistics',{headers:headers('owner')});assert.equal(page.status,200);assert((await page.text()).includes('Красная кнопка'));
  const data=await fetch(origin+'/api/admin/statistics/upgrades',{headers:headers('owner')});assert.equal(data.status,200);assert.equal((await data.json()).rows[0].target_value_coins,100);
 }finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));await new Promise(r=>mock.close(r))}
});
