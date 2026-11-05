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
  if(url.pathname.endsWith('/rewards_season_daily_schedule'))return res.end(JSON.stringify(['ttt_win','wordly_win','predict_winner'].map(task_key=>({task_key,target:1,reward:150}))));
  if(url.pathname.endsWith('/rewards_season_task_progress'))return res.end(JSON.stringify([{task_key:'ttt_win',period_key:new Date(Date.now()+10800000).toISOString().slice(0,10),progress:1,completed_at:new Date().toISOString()}]));
  if(url.pathname.endsWith('/rewards_admins'))return res.end('[]');
  if(url.pathname.endsWith('/rewards_predict_matches'))return res.end(JSON.stringify([{id:'test-match',starts_at:'2099-01-01T00:00:00Z',status:'scheduled'}]));
  if(url.pathname.endsWith('/rewards_predictions')){readFilter=url.searchParams.get('user_id');return res.end('[]')}
  if(url.pathname.includes('/rpc/rewards_ttt_')){let body='';for await(const chunk of req)body+=chunk;rpcBody=JSON.parse(body);if(url.pathname.endsWith('_state'))return res.end(JSON.stringify({serverNow:new Date().toISOString(),room:null,currentRoomId:null,rooms:[],history:[]}));return res.end(JSON.stringify({ok:true,roomId:rpcBody.p_room}))}
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
  const page=await fetch(origin+'/predict',{headers});assert.equal(page.status,200);const pageHtml=await page.text();assert(pageHtml.includes('<h1>Предикт</h1>'));assert(!pageHtml.includes('До 10 монет'));
  const list=await fetch(origin+'/api/me/predict',{headers});assert.equal(list.status,200);assert.equal((await list.json()).matches[0].closes_at,'2098-12-31T23:45:00.000Z');assert.equal(readFilter,'eq.'+userId);
  const save=await fetch(origin+'/api/me/predict/test-match',{method:'POST',headers,body:JSON.stringify({winner:'b',score:'2:1',topPlayer:'b1t',user_id:'spoofed'})});assert.equal(save.status,200);assert.equal(rpcBody.p_user_id,userId);assert.equal(rpcBody.p_top_player,'b1t');
  const closed=await fetch(origin+'/api/me/predict/test-match',{method:'POST',headers,body:JSON.stringify({winner:'b',score:'2:1',topPlayer:'late'})});assert.equal(closed.status,409);assert.equal((await closed.json()).error,'predictions_closed');
  const invalid=await fetch(origin+'/api/me/predict/test-match',{method:'POST',headers,body:JSON.stringify({winner:'b',score:'2:2',topPlayer:'b1t'})});assert.equal(invalid.status,400);
  const admin=await fetch(origin+'/api/admin/predict/test-match/settle',{method:'POST',headers,body:JSON.stringify({winner:'b',score:'2:1',topPlayers:['b1t']})});assert.equal(admin.status,403);
  assert.equal((await fetch(origin+'/games/tic-tac-toe')).status,401);
  const tttPage=await fetch(origin+'/games/tic-tac-toe',{headers});assert.equal(tttPage.status,200);assert((await tttPage.text()).includes('Крестики-нолики'));
  const roomId='12345678-1234-4123-8123-123456789abc';
  const created=await fetch(origin+'/api/me/tic-tac-toe/create',{method:'POST',headers,body:JSON.stringify({roomId,isPrivate:true,password:'secret-pass',user_id:'spoofed'})});assert.equal(created.status,200);assert.equal(rpcBody.p_user,userId);assert.match(rpcBody.p_password_hash,/^[a-f0-9]{64}$/);assert(!JSON.stringify(rpcBody).includes('secret-pass'));
  const joined=await fetch(origin+'/api/me/tic-tac-toe/'+roomId+'/join',{method:'POST',headers,body:JSON.stringify({password:'secret-pass'})});assert.equal(joined.status,200);assert.equal(typeof rpcBody.p_host_x,'boolean');
  assert.equal((await fetch(origin+'/api/me/tic-tac-toe?room=bad',{headers})).status,400);
  assert.equal((await fetch(origin+'/api/me/tic-tac-toe/'+roomId+'/move',{method:'POST',headers,body:JSON.stringify({cell:9,revision:1})})).status,400);
  const gamesPage=await(await fetch(origin+'/games',{headers})).text();assert(gamesPage.includes('href="/games/tic-tac-toe"'));assert(gamesPage.includes('Вордли'));
  const bpResponse=await fetch(origin+'/api/me/season',{headers});assert.equal(bpResponse.status,200);const bp=await bpResponse.json();assert.deepEqual(bp.daily.map(x=>x.key),['ttt_win','wordly_win','predict_winner']);assert(bp.daily.every(x=>x.reward===150&&x.target===1));assert.equal(bp.daily[0].done,true);assert.match(bp.daily[0].title,/крестики-нолики/);assert.match(bp.daily[2].title,/победителя матча/);
  const image=await fetch(origin+'/predict-assets/parivision.png');assert.equal(image.status,200);assert.equal(image.headers.get('Content-Type'),'image/png');
 }finally{server.kill();await new Promise(r=>mock.close(r));}
});
