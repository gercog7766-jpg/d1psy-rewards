import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {runInNewContext} from 'node:vm';
import {withSiteBranding} from '../src/site-branding.ts';
import {gamesHtml,wordlyHtml} from '../src/games-ui.ts';
import {minesweeperHtml} from '../src/minesweeper-ui.ts';import {defuseHtml} from '../src/defuse-ui.ts';import {nightRunHtml} from '../src/night-run-ui.ts';
import {usersHtml,profileHtml,usersJs} from '../src/users-ui.ts';import {streamersHtml} from '../src/streamers-directory-ui.ts';
import {pilotHtml,pilotJs,pilotObsHtml} from '../src/streamer-live-ui.ts';import {vaultHtml,vaultAdminHtml} from '../src/vault-ui.ts';
import {referralHtml} from '../src/referral-ui.ts';import {communityHtml} from '../src/social-ui.ts';import {predictHtml} from '../src/predict-ui.ts';
import {suggestionsHtml} from '../src/suggestions-ui.ts';import {pwaManifest,pwaSw,pwaPanel,pwaJs,offlineHtml,pwaHead} from '../src/pwa-assets.ts';
const pause=()=>new Promise(r=>setTimeout(r,15));
test('Dropso covers titles, headers, games, community, partners and offline copy without changing DOM hooks',()=>{
 const pages=[gamesHtml,wordlyHtml,minesweeperHtml(),defuseHtml,nightRunHtml,usersHtml,profileHtml,streamersHtml,pilotHtml(false),pilotHtml(true),pilotObsHtml,vaultHtml,vaultAdminHtml,referralHtml,communityHtml,predictHtml,suggestionsHtml(false),offlineHtml];
 for(const input of pages){const before=new JSDOM(input),html=withSiteBranding(input,'/test'),d=new JSDOM(html),doc=d.window.document;assert(doc.title.includes('Dropso'),doc.title);doc.querySelectorAll('script,style').forEach(n=>n.remove());assert(!/D1PSY/i.test(doc.body.textContent),doc.title);for(const el of before.window.document.querySelectorAll('[id]'))assert(doc.getElementById(el.id)||el.tagName==='SCRIPT'||el.tagName==='STYLE',el.id);assert.equal(withSiteBranding(html,'/test'),html);before.window.close();d.window.close()}
});
test('footer, metadata and split wordmark change while personal identity, links, storage and scripts survive',()=>{
 const script='<script>const channel="d1psy_off",cookie="d1psy_consent",text="D1PSY Rewards";</script>',input='<!doctype html><html><head><title>D1PSY Rewards</title><meta name="description" content="D1PSY Rewards — дропы"></head><body><a class="brand" href="/account">D1PSY <span>REWARDS</span></a><footer><strong>D1PSY Rewards</strong><a href="/streamer">Стримерам</a><a href="https://www.twitch.tv/d1psy_off" aria-label="Twitch D1PSY">d1psy_off</a><p>© 2026 D1PSY Rewards</p></footer>'+script+'</body></html>',html=withSiteBranding(input,'/'),d=new JSDOM(html),doc=d.window.document;
 assert.equal(doc.title,'Dropso');assert.equal(doc.querySelector('.brand').textContent,'Dropso');assert.equal(doc.querySelector('footer strong').textContent,'Dropso');assert.equal(doc.querySelector('[name=description]').content,'Dropso — дропы');assert.equal(doc.querySelector('[href="/streamer"]').textContent,'Стримерам');assert.equal(doc.querySelector('[href^="https://www.twitch.tv/"]').getAttribute('aria-label'),'Twitch D1PSY');assert(html.includes(script));d.window.close();
 const account=withSiteBranding('<html><head></head><body><a class="brand" href="/account"><span class="brand-mark">D1</span></a></body></html>','/account'),a=new JSDOM(account);assert.equal(a.window.document.querySelector('.dropso-wordmark').textContent,'Dropso');a.window.close();
});
test('streamer application remains a Dropso partnership after async guest and pending profile responses',async()=>{
 for(const status of [null,'pending']){const d=new JSDOM(withSiteBranding(pilotHtml(false),'/streamer'),{url:'https://test.local/streamer',runScripts:'outside-only'}),w=d.window;w.fetch=async()=>status?{ok:true,json:async()=>({profile:{login:'d1psy_off',status},history:[],promos:[],catalog:[]})}:{ok:false,status:401,json:async()=>({})};try{w.eval(pilotJs);await pause();assert.equal(w.document.getElementById('pageTitle').textContent,'Стать партнёром Dropso');assert(!w.document.body.textContent.includes('Стать стримером D1PSY'))}finally{w.close()}}
 assert(usersJs.includes('ПАРТНЁР DROPSO'));assert(!usersJs.includes('D1PSY Rewards'));assert(pilotObsHtml.includes('Dropso'));
});
test('PWA keeps installation identity and migrates legacy cached copy and push service titles',async()=>{
 assert.equal(pwaManifest.name,'Dropso');assert.equal(pwaManifest.short_name,'Dropso');assert.equal(pwaManifest.id,'/');assert.equal(pwaManifest.start_url,'/app');assert(pwaHead.includes('content="Dropso"'));assert(pwaPanel.includes('Приложение Dropso'));assert(!pwaJs.includes('D1PSY'));
 const handlers={},deleted=[],notifications=[];const self={addEventListener:(k,v)=>handlers[k]=v,clients:{claim:async()=>{}},registration:{showNotification:async(title)=>notifications.push(title)}};
 runInNewContext(pwaSw,{self,caches:{keys:async()=>['d1psy-pwa-static-brand-v2','d1psy-pwa-static-brand-v3-dropso','unrelated'],delete:async k=>deleted.push(k)}});
 await new Promise((resolve,reject)=>handlers.activate({waitUntil:p=>p.then(resolve,reject)}));assert.deepEqual(deleted,['d1psy-pwa-static-brand-v2']);
 for(const title of ['D1PSY · Уведомления работают','Drop','D1PSY_OFF'])await new Promise((resolve,reject)=>handlers.push({data:{json:()=>({title})},waitUntil:p=>p.then(resolve,reject)}));assert.deepEqual(notifications,['Dropso · Уведомления работают','Drop','D1PSY_OFF']);
});

test('actual Express pages and footer ship Dropso after all legacy hotfixes, preserving nickname and links',{timeout:30000},async()=>{
 const {createServer}=await import('node:http'),{spawn}=await import('node:child_process'),{createHmac}=await import('node:crypto');
 const mock=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(req.url.includes('/rewards_users')?JSON.stringify({id:'00000000-0000-4000-8000-000000000001',twitch_login:'viewer'}):'[]')});await new Promise(r=>mock.listen(0,'127.0.0.1',r));const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));const base='http://127.0.0.1:'+port;
 const server=spawn(process.execPath,['--import','tsx','src/server-entry.ts'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),APP_URL:base,SESSION_SECRET:'dropso-test',SUPABASE_URL:'http://127.0.0.1:'+mock.address().port,SUPABASE_SECRET_KEY:'test',REWARDS_ENGINE_ENABLED:'false',TWITCH_CLIENT_ID:'',TWITCH_EVENTSUB_SECRET:''},stdio:'ignore'});
 const token=Buffer.from(JSON.stringify({twitchUserId:'viewer',login:'viewer',exp:Date.now()+120000})).toString('base64url'),cookie='rewards_session='+token+'.'+createHmac('sha256','dropso-test').update(token).digest('base64url');
 try{for(let i=0;i<150;i++){try{await fetch(base+'/health');break}catch{await new Promise(r=>setTimeout(r,30))}}
  for(const path of ['/','/terms','/rules','/privacy','/account','/shop','/upgrader','/season','/games','/games/minesweeper','/games/defuse','/games/night-run','/users','/users/amych','/streamers','/streamer']){
   const response=await fetch(base+path,{headers:{Cookie:cookie}});assert.equal(response.status,200,path);const d=new JSDOM(await response.text()),doc=d.window.document;assert(doc.title.includes('Dropso'),path+': '+doc.title);doc.querySelectorAll('script,style').forEach(n=>n.remove());assert(!/d1psy rewards|D1PSY MARKET|Стать стримером D1PSY/.test(doc.body.textContent),path);if(path==='/streamer')assert.equal(doc.getElementById('pageTitle').textContent,'Стать партнёром Dropso');if(path==='/account'){assert.equal(doc.querySelector('.footer-brand strong').textContent,'Dropso');assert(doc.querySelector('[href="https://www.twitch.tv/d1psy_off"]'));assert(doc.querySelector('.dropso-wordmark'));}d.window.close();
  }
 }finally{server.kill('SIGTERM');await new Promise(r=>mock.close(r))}
});
