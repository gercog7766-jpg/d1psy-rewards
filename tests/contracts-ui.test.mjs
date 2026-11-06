import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM,VirtualConsole} from 'jsdom';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {createHmac,randomUUID} from 'node:crypto';
import {contractsHtml,contractsJs} from '../src/contracts-ui.ts';
const tick=()=>new Promise(r=>setImmediate(r));
test('inventory contracts: real API, 3–10 selection, confirmation, busy lock, server reward, replay and safe text',async()=>{
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(contractsHtml,{runScripts:'outside-only',url:'https://example.test/contracts',virtualConsole:vc}),w=dom.window,q=s=>w.document.querySelector(s);
 const inventory=Array.from({length:12},(_,i)=>({id:randomUUID(),name:i===0?'<img src=x onerror=alert(1)>':'Skin '+i,price:100,imageUrl:'/skin.png',wear:'FT',kind:'normal'}));let posts=[],resolvePost,fail=false;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.matchMedia=()=>({matches:true});
 w.fetch=async(url,options)=>{assert.equal(url,'/api/me/contracts');if(options?.method==='POST'){posts.push(JSON.parse(options.body));if(fail)throw Error('network');await new Promise(r=>resolvePost=r);return {ok:true,json:async()=>({reward:{id:randomUUID(),name:'Server reward',price:250,imageUrl:'/result.png',wear:'FN'}})}}return{ok:true,json:async()=>({inventory})}};
 w.eval(contractsJs);await tick();const choose=i=>q('[data-id="'+inventory[i].id+'"]').click();
 assert.equal(w.document.querySelectorAll('.item').length,12);assert(!q('.item b img'));assert.equal(q('#review').disabled,true);
 choose(0);choose(1);assert(q('#review').disabled);choose(2);assert.equal(q('#sum').textContent,'300 монет');assert.equal(w.document.querySelectorAll('.filled').length,3);
 q('#review').click();assert(q('#confirm').open);q('#cancel').click();assert.equal(posts.length,0);
 q('#review').click();q('#sign').click();assert(q('#review').disabled);assert(q('.item').disabled);q('#sign').click();assert.equal(posts.length,1);assert.equal(posts[0].sourceWinIds.length,3);assert.equal(Object.keys(posts[0]).sort().join(','),'requestId,sourceWinIds');
 resolvePost();await tick();await new Promise(r=>setTimeout(r,15));assert(q('#result').open);assert.equal(q('#resultName').textContent,'Server reward');assert.equal(q('#resultValue').textContent,'250 монет');assert.equal(q('#count').textContent,'0');assert.equal(w.sessionStorage.getItem('d1psy-contract-pending'),null);
 q('#again').click();for(let i=0;i<10;i++)choose(i);assert(q('[data-id="'+inventory[10].id+'"]').disabled);assert.equal(q('#count').textContent,'10');q('#clear').click();
 choose(0);choose(1);choose(2);fail=true;q('#review').click();q('#sign').click();await tick();assert.equal(posts.length,3);assert.deepEqual(posts[1],posts[2]);assert.equal(q('#count').textContent,'3');assert(!q('#review').disabled);
 q('#review').click();q('#sign').click();await tick();assert.equal(posts[3].requestId,posts[1].requestId);
 q('#search').value='Skin 11';q('#search').dispatchEvent(new w.Event('input'));assert.equal(w.document.querySelectorAll('.item').length,1);
 assert(!q('.notice'));assert(!q('.side'));assert(!q('.paper'));assert(!contractsHtml.includes('Деморежим'));assert.deepEqual(errors,[]);w.close();
});
test('full app contracts: auth, navigation, validation and CSRF',{timeout:15000},async()=>{
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const server=spawn(process.execPath,['--import','tsx','src/server-entry.ts'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),SESSION_SECRET:'contracts-test',SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_SECRET_KEY:'test-key',TWITCH_CLIENT_ID:'',TWITCH_EVENTSUB_SECRET:''},stdio:'ignore'});
 const base='http://127.0.0.1:'+port,payload=Buffer.from(JSON.stringify({twitchUserId:'viewer',exp:Date.now()+120000})).toString('base64url'),cookie='rewards_session='+payload+'.'+createHmac('sha256','contracts-test').update(payload).digest('base64url');
 try{
 for(let i=0;i<100;i++){try{await fetch(base+'/contracts.js');break}catch{await new Promise(r=>setTimeout(r,40))}}
 assert.equal((await fetch(base+'/contracts')).status,401);assert.equal((await fetch(base+'/api/me/contracts')).status,401);
 const page=await fetch(base+'/contracts',{headers:{Cookie:cookie}});assert.equal(page.status,200);assert((await page.text()).includes('Твой инвентарь'));
 const account=await(await fetch(base+'/account')).text();assert.match(account,/href="\/upgrader"[^>]*>[\s\S]*?<\/a><a id="contractsLink"/);assert(account.includes('В КОНТРАКТЕ'));
 const post=(body,origin)=>fetch(base+'/api/me/contracts',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
 assert.equal((await post({})).status,400);assert.equal((await post({},'https://evil.test')).status,403);
 assert.equal((await post({requestId:randomUUID(),sourceWinIds:[randomUUID(),randomUUID(),randomUUID()]})).status,503);
 }finally{server.kill('SIGTERM')}
});
