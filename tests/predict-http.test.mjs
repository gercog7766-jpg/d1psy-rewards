import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';

test('real app: navigation, signed user identity, own predictions and admin-only settlement',{timeout:25000},async()=>{
 const userId='00000000-0000-4000-8000-000000000001';let rpcBody,readFilter;
 const mock=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');const url=new URL(req.url,'http://test');
  if(url.pathname.endsWith('/rewards_users'))return res.end(JSON.stringify({id:userId,twitch_display_name:'Test'}));
  if(url.pathname.endsWith('/rewards_admins'))return res.end('[]');
  if(url.pathname.endsWith('/rewards_predict_matches'))return res.end(JSON.stringify([{id:'test-match',starts_at:'2099-01-01T00:00:00Z',status:'scheduled'}]));
  if(url.pathname.endsWith('/rewards_predictions')){readFilter=url.searchParams.get('user_id');return res.end('[]')}
  if(url.pathname.endsWith('/rpc/rewards_save_prediction')){let body='';for await(const chunk of req)body+=chunk;rpcBody=JSON.parse(body);if(rpcBody.p_top_player==='late'){res.statusCode=400;return res.end(JSON.stringify({code:'P0001',message:'predictions_closed'}))}return res.end(JSON.stringify({winner:rpcBody.p_winner,score:rpcBody.p_score,top_player:rpcBody.p_top_player,updated_at:new Date().toISOString()}))}
  res.end('[]');
 });
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));const mockPort=mock.address().port;
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const appPort=reserve.address().port;await new Promise(r=>reserve.close(r));
 const server=spawn(process.execPath,['--import','tsx','src/server-entry.ts'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(appPort),SESSION_SECRET:'prediction-http-test',SUPABASE_URL:'http://127.0.0.1:'+mockPort,SUPABASE_SECRET_KEY:'test-key',TWITCH_CLIENT_ID:'',TWITCH_EVENTSUB_SECRET:''},stdio:'ignore'});
 const origin='http://127.0.0.1:'+appPort;
 const payload=Buffer.from(JSON.stringify({twitchUserId:'twitch-test',exp:Date.now()+60000})).toString('base64url');
 const cookie='rewards_session='+payload+'.'+createHmac('sha256','prediction-http-test').update(payload).digest('base64url');
 const headers={Cookie:cookie,'Content-Type':'application/json'};
 try{
  for(let i=0;i<100;i++){try{await fetch(origin+'/predict.js');break}catch{await new Promise(r=>setTimeout(r,50))}}
  assert.equal((await fetch(origin+'/predict')).status,401);
  assert.equal((await fetch(origin+'/api/me/predict')).status,401);
  const html=await (await fetch(origin+'/account')).text();
  assert(/id="gamesLink"[^>]*>Игры<\/a><a id="predictLink"[^>]*>Предикт<\/a><a[^>]*href="\/upgrader"/.test(html));
  const page=await fetch(origin+'/predict',{headers});assert.equal(page.status,200);assert((await page.text()).includes('До 10 монет'));
  const list=await fetch(origin+'/api/me/predict',{headers});assert.equal(list.status,200);assert.equal((await list.json()).matches[0].closes_at,'2098-12-31T23:45:00.000Z');assert.equal(readFilter,'eq.'+userId);
  const save=await fetch(origin+'/api/me/predict/test-match',{method:'POST',headers,body:JSON.stringify({winner:'b',score:'2:1',topPlayer:'b1t',user_id:'spoofed'})});assert.equal(save.status,200);assert.equal(rpcBody.p_user_id,userId);assert.equal(rpcBody.p_top_player,'b1t');
  const closed=await fetch(origin+'/api/me/predict/test-match',{method:'POST',headers,body:JSON.stringify({winner:'b',score:'2:1',topPlayer:'late'})});assert.equal(closed.status,409);assert.equal((await closed.json()).error,'predictions_closed');
  const invalid=await fetch(origin+'/api/me/predict/test-match',{method:'POST',headers,body:JSON.stringify({winner:'b',score:'2:2',topPlayer:'b1t'})});assert.equal(invalid.status,400);
  const admin=await fetch(origin+'/api/admin/predict/test-match/settle',{method:'POST',headers,body:JSON.stringify({winner:'b',score:'2:1',topPlayers:['b1t']})});assert.equal(admin.status,403);
  const image=await fetch(origin+'/predict-assets/parivision.png');assert.equal(image.status,200);assert.equal(image.headers.get('Content-Type'),'image/png');
 }finally{server.kill();await new Promise(r=>mock.close(r));}
});
