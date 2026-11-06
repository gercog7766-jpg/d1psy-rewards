import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM,VirtualConsole} from 'jsdom';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {createHmac} from 'node:crypto';
import {contractsHtml,contractsJs} from '../src/contracts-ui.ts';

test('demo contracts: 3–10 items, confirmation, all probability boundaries, animation lock and no account API calls',()=>{
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(contractsHtml,{runScripts:'outside-only',url:'https://example.test/contracts',virtualConsole:vc});
 const w=dom.window,q=s=>w.document.querySelector(s);const timers=[];let calls=0,roll=0;
 w.fetch=()=>{calls++;throw Error('Demo must not access account APIs')};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.matchMedia=()=>({matches:false});w.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length};
 Object.defineProperty(w.crypto,'getRandomValues',{value:a=>{a[0]=roll;return a}});
 w.eval(contractsJs);
 const choose=id=>q('[data-id="'+id+'"]').click();const run=()=>{q('#review').click();q('#sign').click();while(timers.length)timers.shift().fn()};
 assert.equal(q('#review').disabled,true);choose(0);choose(1);assert.equal(q('#review').disabled,true);choose(2);
 assert.equal(q('#review').disabled,false);assert(q('#sum').textContent.includes('180'));
 assert.equal(w.document.querySelectorAll('.filled').length,3);assert(q('#odds').textContent.includes('54–144 монет'));
 q('#review').click();assert(q('#confirm').open);assert.equal(q('#confirmCount').textContent,'3');q('#cancel').click();assert(!q('#confirm').open);assert.equal(timers.length,0);
 q('#review').click();q('#sign').click();assert(q('#machine').classList.contains('signing'));assert(q('#review').disabled);assert(q('[data-id="0"]').disabled);
 q('#sign').click();assert.equal(timers.length,2);timers.shift().fn();assert(q('#machine').classList.contains('revealing'));timers.shift().fn();
 assert(q('#result').open);assert.equal(q('#resultValue').textContent,'54 монет');assert(q('#resultRatio').textContent.includes('30%'));assert.equal(calls,0);
 q('#again').click();assert.equal(q('#count').textContent,'0');assert(!q('#result').open);
 for(let id=0;id<10;id++)choose(id);assert.equal(q('#count').textContent,'10');assert(q('[data-id="10"]').disabled);choose(10);assert.equal(q('#count').textContent,'10');choose(0);assert(!q('[data-id="10"]').disabled);choose(10);assert.equal(q('#count').textContent,'10');
 q('#clear').click();assert.equal(q('#count').textContent,'0');
 // The only data source is the hardcoded teaching collection. Exercise tier edges.
 for(const [r,range] of [[54,'30–80%'],[55,'81–105%'],[79,'81–105%'],[80,'106–150%'],[94,'106–150%'],[95,'151–200%'],[99,'151–200%']]){
  choose(0);choose(1);choose(2);roll=r;run();assert(q('#resultDetail').textContent.includes(range));q('#again').click();
 }
 q('#search').value='НЕСУЩЕСТВУЮЩИЙ';q('#search').dispatchEvent(new w.Event('input'));assert(q('.emptyCatalog'));
 q('#search').value='Бизон';q('#search').dispatchEvent(new w.Event('input'));assert.equal(w.document.querySelectorAll('.item').length,1);
 assert.equal(calls,0);assert.deepEqual(errors,[]);dom.window.close();
});

test('full app: contracts navigation adjacent to upgrader and authenticated demo route',{timeout:15000},async()=>{
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const server=spawn(process.execPath,['--import','tsx','src/server-entry.ts'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),SESSION_SECRET:'contracts-test',SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_SECRET_KEY:'test-key',TWITCH_CLIENT_ID:'',TWITCH_EVENTSUB_SECRET:''},stdio:'ignore'});
 const base='http://127.0.0.1:'+port;const payload=Buffer.from(JSON.stringify({twitchUserId:'viewer',exp:Date.now()+120000})).toString('base64url'),cookie='rewards_session='+payload+'.'+createHmac('sha256','contracts-test').update(payload).digest('base64url');
 try{
  for(let i=0;i<100;i++){try{await fetch(base+'/contracts.js');break}catch{await new Promise(r=>setTimeout(r,40))}}
  const blocked=await fetch(base+'/contracts',{redirect:'manual'});assert([302,401].includes(blocked.status));
  const page=await fetch(base+'/contracts',{headers:{Cookie:cookie}});assert.equal(page.status,200);const html=await page.text();assert(html.includes('Учебная коллекция'));assert(html.includes('Деморежим'));
  const account=await(await fetch(base+'/account')).text();assert.match(account,/href="\/upgrader"[^>]*>[\s\S]*?<\/a><a id="contractsLink"/);
  assert.equal((account.match(/id="contractsLink"/g)||[]).length,1);
  assert.equal((await fetch(base+'/contracts.js')).status,200);
  assert.equal((await fetch(base+'/api/me/contracts',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'})).status,404);
 }finally{server.kill('SIGTERM')}
});
