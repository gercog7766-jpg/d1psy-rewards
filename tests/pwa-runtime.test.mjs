import {test} from 'node:test';import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';import {spawn} from 'node:child_process';import http from 'node:http';import {runInNewContext} from 'node:vm';
import {validPushSubscription} from '../src/pwa-hotfix.ts';import {pwaSw,pwaManifest} from '../src/pwa-assets.ts';import {deliverJobs} from '../supabase/functions/drop-push/delivery.ts';

test('PWA worker: only public assets cached, API bypass, offline fallback and safe notification click',async()=>{
 const handlers={},notifications=[],opened=[],cached=[];const self={location:{origin:'https://d1psy.test'},skipWaiting:async()=>{},addEventListener:(e,h)=>handlers[e]=h,registration:{showNotification:async(t,o)=>notifications.push([t,o])},clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async u=>opened.push(u)}};
 runInNewContext(pwaSw,{self,URL,caches:{open:async()=>({addAll:async a=>cached.push(...a)}),keys:async()=>[],match:async()=>({offline:true})},fetch:async()=>{throw Error('offline')}});
 const event=(name,data={})=>new Promise((resolve,reject)=>handlers[name]({...data,waitUntil:p=>p.then(resolve,reject)}));
 await event('install');assert(cached.every(p=>p.startsWith('/pwa/')));assert(!cached.includes('/account'));
 let responded=false;handlers.fetch({request:{url:'https://d1psy.test/api/me/wins',method:'GET'},respondWith:()=>responded=true});assert.equal(responded,false);
 handlers.fetch({request:{url:'https://d1psy.test/auth/twitch',method:'GET',mode:'navigate'},respondWith:()=>responded=true});assert.equal(responded,false);
 let response;handlers.fetch({request:{url:'https://d1psy.test/account',method:'GET',mode:'navigate'},respondWith:p=>response=p});assert.deepEqual(await response,{offline:true});
 await event('push',{data:{json:()=>({title:'Drop',body:'Skin',url:'https://evil.test'})}});assert.equal(notifications[0][1].data.url,'/app');
 await event('notificationclick',{notification:{close:()=>{},data:{url:'https://evil.test'}}});assert.deepEqual(opened,['/app']);assert.equal(pwaManifest.start_url,'/app');assert.equal(pwaManifest.display,'standalone');
});

test('push endpoint validation blocks SSRF and malformed encryption keys',()=>{
 const body={endpoint:'https://fcm.googleapis.com/fcm/send/token',keys:{p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64)]).toString('base64url'),auth:Buffer.alloc(16).toString('base64url')}};
 assert(validPushSubscription(body));for(const endpoint of ['https://127.0.0.1/private','http://fcm.googleapis.com/test','https://fcm.googleapis.com.evil.test/test','https://fcm.googleapis.com:8443/test','https://user@fcm.googleapis.com/test'])assert(!validPushSubscription({...body,endpoint}));assert(!validPushSubscription({...body,keys:{auth:'bad',p256dh:'bad'}}));
});

test('push worker: successful delivery, permanent expiry removal and transient retry',async()=>{
 const changes=[],removed=[];const jobs=[0,1,2].map(i=>({id:'j'+i,subscription_id:'s'+i,attempts:1,payload:{title:'Test'}}));
 const db={rpc:async name=>({data:name==='rewards_push_claim'?jobs:{login:'user'}}),from:table=>{
  const chain={select:()=>chain,eq:(_k,id)=>{chain.id=id;return chain},maybeSingle:async()=>({data:{id:chain.id,endpoint:chain.id,p256dh:'key',auth:'auth',device_token_hash:'device'}}),update:v=>{changes.push(v);return chain},delete:()=>{removed.push(table);return chain},then:r=>r({error:null})};return chain;
 }};
 const r=await deliverJobs(db,async sub=>{if(sub.endpoint==='s1')throw Object.assign(Error(),{statusCode:410});if(sub.endpoint==='s2')throw Object.assign(Error(),{statusCode:503})});
 assert.deepEqual(r,{claimed:3,sent:1,expired:1,retry:1});assert.equal(removed.length,1);assert(changes.some(x=>x.status==='queued'&&x.last_error==='http_503'));assert(changes.some(x=>x.status==='done'));
});

test('full app: PWA metadata, device-only relaunch, expired/revoked login and logout',{timeout:20000},async()=>{
 let sessions=new Map(),removed=false;
 const mock=http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):null;const url=new URL(req.url,'http://mock');
  if(url.pathname.endsWith('/rewards_users'))return res.end(JSON.stringify({id:'00000000-0000-4000-8000-000000000001',twitch_login:'viewer',banned:false}));
  if(url.pathname.endsWith('/rewards_device_sessions')){if(req.method==='POST')sessions.set(body.token_hash,true);if(req.method==='DELETE'){sessions.delete(url.searchParams.get('token_hash')?.replace('eq.',''));removed=true}return res.end('[]')}
  if(url.pathname.endsWith('/rpc/rewards_device_resolve'))return res.end(JSON.stringify(sessions.has(body.p_hash)?{twitchUserId:'viewer',login:'viewer',displayName:'Viewer',expiresAt:new Date(Date.now()+180*86400000).toISOString()}:null));
  if(url.pathname.endsWith('/rewards_push_config'))return res.end(JSON.stringify({public_key:'public-only'}));
  res.end('[]');
 });await new Promise(r=>mock.listen(0,'127.0.0.1',r));
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const server=spawn(process.execPath,['--import','tsx','src/server-entry.ts'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),SESSION_SECRET:'pwa-test',SUPABASE_URL:'http://127.0.0.1:'+mock.address().port,SUPABASE_SECRET_KEY:'test-key',TWITCH_CLIENT_ID:'',TWITCH_EVENTSUB_SECRET:'',REWARDS_ENGINE_ENABLED:'false'},stdio:'ignore'});
 const base='http://127.0.0.1:'+port;const signed=data=>{const p=Buffer.from(JSON.stringify(data)).toString('base64url');return p+'.'+createHmac('sha256','pwa-test').update(p).digest('base64url')};
 const legacy='rewards_session='+signed({twitchUserId:'viewer',login:'viewer',displayName:'Viewer',exp:Date.now()+120000});
 try{
  for(let i=0;i<150;i++){try{await fetch(base+'/health');break}catch{await new Promise(r=>setTimeout(r,40))}}
  const home=await(await fetch(base+'/')).text();assert(home.includes('href="/manifest.webmanifest"'));
  const page=await fetch(base+'/account',{headers:{Cookie:legacy}});const html=await page.text();assert(html.includes('<dialog id="d1PwaPanel"'));assert(html.includes('id="d1PwaOpen"'));assert(!html.includes('<section id="d1PwaPanel"'));assert.equal((html.match(/href="\/manifest.webmanifest"/g)||[]).length,1);
  const cookies=page.headers.getSetCookie();const device=cookies.find(c=>c.startsWith('rewards_device='))?.split(';')[0];assert(device);assert(cookies.some(c=>c.includes('Max-Age=15552000')));assert(cookies.some(c=>c.includes('HttpOnly')));
  const manifest=await(await fetch(base+'/manifest.webmanifest')).json();assert.equal(manifest.name,'D1PSY Rewards');const icon=await fetch(base+'/pwa/icon/512.png');assert.equal(icon.headers.get('content-type'),'image/png');assert.equal(Buffer.from(await icon.arrayBuffer()).readUInt32BE(16),512);
  const sw=await fetch(base+'/sw.js');assert.equal(sw.headers.get('service-worker-allowed'),'/');assert.equal(sw.headers.get('cache-control'),'no-cache');
  const relaunch=await fetch(base+'/app',{headers:{Cookie:device},redirect:'manual'});assert.equal(relaunch.headers.get('location'),'/account');assert.equal((await fetch(base+'/api/me',{headers:{Cookie:device}})).status,200);
  assert.equal((await fetch(base+'/api/me',{headers:{Cookie:'rewards_session='+signed({twitchUserId:'viewer',exp:Date.now()+120000,deviceSession:true})}})).status,401);
  assert.equal((await fetch(base+'/api/me/push',{method:'POST',headers:{Cookie:device,Origin:'https://evil.test','Content-Type':'application/json'},body:'{}'})).status,403);
  const settings=await(await fetch(base+'/api/me/push',{headers:{Cookie:device}})).json();assert.equal(settings.publicKey,'public-only');assert(!JSON.stringify(settings).includes('privateKey'));
  const logout=await fetch(base+'/logout',{method:'POST',headers:{Cookie:device},redirect:'manual'});assert.equal(logout.status,302);assert(removed);assert.equal((await fetch(base+'/api/me',{headers:{Cookie:device}})).status,401);
 }finally{server.kill('SIGTERM');await new Promise(r=>mock.close(r))}
});
