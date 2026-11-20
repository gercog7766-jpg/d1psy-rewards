import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {JSDOM} from 'jsdom';
import {installClans} from '../src/clans.ts';
import {clansHtml,clansJs} from '../src/clans-ui.ts';

test('clan routes enforce signed actor, JSON origin, avatar bounds and admin access',async()=>{
 const app=express(),calls=[];app.use(express.json());
 const user=(q,r,n)=>{if(!q.get('x-user'))return r.sendStatus(401);r.locals.session={twitchUserId:q.get('x-user')};n()};
 const admin=(q,r,n)=>user(q,r,()=>q.get('x-user')==='admin'?n():r.sendStatus(403));
 installClans(app,{rpc:async(name,body)=>{calls.push({name,body});return {data:body.p_action==='list'?{mine:'a',myRank:1,myScore:23,clans:[{id:'a',name:'Zeta',level:2,score:23,rank:1},{id:'b',name:'Alpha',level:1,score:10,rank:2}]}:{ok:true}}}},user,admin,'https://dropso.site');
 const server=app.listen(0);const base='http://127.0.0.1:'+server.address().port;
 const post=(action,body,headers={},admin=false)=>fetch(base+'/api/'+(admin?'admin':'me')+'/clans/'+action,{method:'POST',headers:{'content-type':'application/json','x-user':'alice',...headers},body:JSON.stringify(body)});
 try{
 assert.equal((await fetch(base+'/clans')).status,401);assert.equal((await post('admin',{}, {},true)).status,403);
 assert.equal((await post('create',{name:'Alpha'},{origin:'https://other.site'})).status,403);
 assert.equal((await post('create',{name:'Alpha',actor:'bob'})).status,400);
 assert.equal((await post('create',{name:'Alpha',avatar:'data:image/svg+xml;base64,PHN2Zz4='})).status,400);
 assert.equal((await post('create',{name:'Alpha'})).status,200);assert.equal(calls.at(-1).body.p_actor,'alice');
 const requestId='11111111-1111-4111-8111-111111111111';
 assert.equal((await post('slot',{})).status,400);
 assert.equal((await post('shop_propose',{item:'slot',requestId,amount:1})).status,200);
 assert.equal((await post('shop_vote',{proposalId:requestId,approve:'true'})).status,400);
 assert.equal((await post('shop_vote',{proposalId:requestId,approve:true})).status,200);assert.equal(calls.at(-1).body.p_actor,'alice');
 assert.equal((await post('admin',{}, {'x-user':'admin'},true)).status,200);
 const list=await (await post('list',{})).json();assert.equal(list.myRank,undefined);assert.equal(list.myScore,23);assert.deepEqual(list.clans.map(c=>c.name),['Alpha','Zeta']);assert(list.clans.every(c=>!('score' in c)&&!('rank' in c)));
 }finally{await new Promise(resolve=>server.close(resolve))}
});

test('clan UI safely renders public clan and hides internal tools before membership',async()=>{
 const id='11111111-1111-4111-8111-111111111111',dom=new JSDOM(clansHtml(false),{runScripts:'outside-only',url:'https://dropso.site/clans'}),w=dom.window;
 const wait=()=>new Promise(r=>setTimeout(r,20));
 w.fetch=async(_path,opt)=>{const body=JSON.parse(opt.body);return {ok:true,json:async()=>body.clanId?{id,name:'<img src=x onerror=alert(1)>',member:false,level:1,pending:false}:{mine:null,clans:[{id,name:'<img src=x onerror=alert(1)>',score:0,level:1}]}}};
 try{w.eval(clansJs);await wait();assert(w.document.body.textContent.includes('Создать клан · 150 монет'));assert.equal(w.document.querySelector('img[src="x"]'),null);[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Открыть').click();await wait();assert(w.document.body.textContent.includes('Подать заявку'));assert(!w.document.body.textContent.includes('Общак'));assert(!w.document.body.textContent.includes('Чат клана'));}finally{w.close()}
});

test('site owner can inspect a clan without membership; ordinary users and other admins cannot',async()=>{
 const clanId='11111111-1111-4111-8111-111111111111',memberId='22222222-2222-4222-8222-222222222222',calls=[];
 const rows={rewards_streamers:[{twitch_broadcaster_id:'owner'}],rewards_clans:[{id:clanId,name:'Alpha',owner_id:memberId,cxp:250,treasury:75,extra_slot:false,min_level:2,min_bp:0}],rewards_clan_members:[{user_id:memberId,rewards_users:{twitch_login:'leader'}}],rewards_clan_requests:[{user_id:'candidate',rewards_users:{twitch_login:'candidate'}}],rewards_clan_tasks:[{source:'vault',label:'Ключи',target:200,cxp:160}],rewards_clan_task_awards:[],rewards_clan_events:Array.from({length:501},(_,i)=>({source:'vault',event_key:String(i),amount:1})),rewards_clan_chat:[{message:'Привет',rewards_users:{twitch_login:'leader'}}],rewards_clan_ledger:[{amount:75,kind:'deposit',rewards_users:{twitch_login:'leader'}}]};
 const db={rpc:async(name,args)=>{calls.push(['rpc',name,args]);return {data:name==='rewards_clan_period'?'2026-11-20':name==='rewards_clan_level'?2:name==='rewards_clan_capacity'?5:{clans:[{id:clanId,name:'Alpha'}],templates:[]}}},from(table){calls.push(['select',table]);let start=0,end=Infinity;const q={select(){return this},eq(){return this},is(){return this},gte(){return this},lt(){return this},order(){return this},limit(n){end=n;return this},range(a,b){start=a;end=b+1;return this},maybeSingle(){return Promise.resolve({data:rows[table]?.[0]||null,error:null})},then(resolve,reject){return Promise.resolve({data:(rows[table]||[]).slice(start,end),error:null}).then(resolve,reject)}};return q}};
 const app=express();app.use(express.json());const user=(q,r,n)=>{if(!q.get('x-user'))return r.sendStatus(401);r.locals.session={twitchUserId:q.get('x-user')};n()};const admin=(q,r,n)=>user(q,r,()=>['owner','moderator'].includes(q.get('x-user'))?n():r.sendStatus(403));installClans(app,db,user,admin,'https://dropso.site');const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
 const post=(actor,action,body,where='admin')=>fetch(base+'/api/'+where+'/clans/'+action,{method:'POST',headers:{'content-type':'application/json','x-user':actor},body:JSON.stringify(body)});
 try{assert.equal((await post('player','inspect',{clanId})).status,403);assert.equal((await post('moderator','inspect',{clanId})).status,403);assert.equal((await post('owner','inspect',{clanId},'me')).status,400);assert.equal((await post('owner','inspect',{clanId,actor:'moderator'})).status,400);assert.equal(calls.filter(c=>c[1]==='rewards_clans').length,0);const result=await post('owner','inspect',{clanId});assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'private,no-store');const d=await result.json();assert.equal(d.members[0].owner,true);assert.equal(d.tasks[0].progress,501);assert.equal(d.chat[0].message,'Привет');assert.equal(d.treasury,75);assert.equal(d.requests[0].login,'candidate');assert(!Object.hasOwn(d,'member'));assert(!calls.some(c=>c[1]==='rewards_clan_api'));assert.equal((await (await post('owner','admin',{})).json()).canInspect,true);assert.equal((await (await post('moderator','admin',{})).json()).canInspect,false)}finally{await new Promise(r=>server.close(r))}
});

test('owner inspection displays private sections safely without player action buttons',async()=>{
 const id='11111111-1111-4111-8111-111111111111',dom=new JSDOM(clansHtml(true),{runScripts:'outside-only',url:'https://dropso.site/admin/clans'}),w=dom.window;const wait=()=>new Promise(r=>setTimeout(r,20));w.fetch=async(path)=>({ok:true,json:async()=>path.endsWith('/inspect')?{id,name:'Alpha',level:2,cxp:250,capacity:5,treasury:75,period:'2026-11-20',ends:'2026-11-30',members:[{login:'Leader',owner:true}],requests:[{login:'Candidate'}],tasks:[{label:'Ключи',progress:20,target:200,cxp:160}],ledger:[{login:'Leader',amount:75}],chat:[{login:'Leader',message:'<img src=x onerror=alert(1)>'}]}:{canInspect:true,clans:[{id,name:'Alpha'}],templates:[]}});
 try{w.eval(clansJs);await wait();[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Просмотреть клан').click();await wait();const text=w.document.body.textContent;assert(text.includes('Режим владельца Dropso'));assert(text.includes('Участники'));assert(text.includes('Чат клана'));assert(text.includes('20/200'));assert(text.includes('Общак · 75 монет'));assert(text.includes('<img src=x'));assert.equal(w.document.querySelector('img[src="x"]'),null);assert(![...w.document.querySelectorAll('button')].some(b=>/Пополнить|Отправить|Исключить|Принять|Отклонить|Купить слот/.test(b.textContent)))}finally{w.close()}
});

test('clan list hides current places, podium and other scores, keeps own CP and season deadline',async()=>{
 const id='11111111-1111-4111-8111-111111111111',dom=new JSDOM(clansHtml(false),{runScripts:'outside-only',url:'https://dropso.site/clans'}),w=dom.window;w.fetch=async()=>({ok:true,json:async()=>({mine:id,myRank:1,myScore:1105,seasonStart:'2026-11-20',seasonEnd:'2027-01-01',serverNow:'2026-11-20T14:00:00+03:00',clans:[{id,name:'Zeta',rank:1,level:4,score:1105},{id:'other',name:'Alpha',rank:2,level:3,score:999}],past:[{rank:1,name:'Old',season_start:'2026-10-01',score:500,prize:1500}]})});try{w.eval(clansJs);await new Promise(r=>setTimeout(r,30));const text=w.document.body.textContent;assert(text.includes('CP твоего клана: 1105'));assert(!text.includes('999 CP'));assert(!text.includes('Твой клан: #1'));assert(text.includes('500 CP'));assert(!w.document.querySelector('.clan-podium-place'));assert(!text.includes('Писать сообщения не нужно'));assert(text.indexOf('Alpha')<text.indexOf('Zeta'));assert(w.document.getElementById('clanSeasonClock').textContent.includes('До конца сезона'))}finally{w.close()}
});

test('clan shop displays previews, spending and member voting without an immediate charge button',async()=>{
 const id='11111111-1111-4111-8111-111111111111',proposalId='22222222-2222-4222-8222-222222222222',calls=[],dom=new JSDOM(clansHtml(false),{runScripts:'outside-only',url:'https://dropso.site/clans'}),w=dom.window;
 const wait=()=>new Promise(r=>setTimeout(r,25));
 const detail={id,name:'Alpha',member:true,leader:false,level:1,cxp:0,capacity:7,treasury:300,members:[{id,login:'Alice',owner:false}],tasks:[],chat:[],requests:[],ends:'2026-11-30',ledger:[{amount:-50,description:'Дополнительный слот'}],shop:{paidSlots:2,nextSlotCost:100,decorations:{},catalog:[{id:'frame_neon',kind:'frame',name:'Неоновый контур',price:100,owned:false}],proposals:[{id:proposalId,label:'Дополнительный слот',amount:100,status:'pending',eligible:5,required:3,yes:2,no:0,my_vote:null,expires_at:new Date().toISOString()}]}};
 w.fetch=async(path,opt)=>{calls.push([path,JSON.parse(opt.body)]);return {ok:true,json:async()=>path.endsWith('/list')?{mine:id,clans:[]}:detail}};w.dropsoConfirm=async()=>true;
 try{w.eval(clansJs);await wait();[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Мой клан →').click();await wait();
 assert(w.document.body.textContent.includes('Платные места: 2/15'));assert(w.document.body.textContent.includes('-50 монет'));assert(w.document.querySelector('.clan-shop-preview.frame'));
 assert(w.document.body.textContent.includes('За: 2/3'));assert([...w.document.querySelectorAll('button')].find(b=>b.textContent.includes('Предложить +1 место')).disabled);
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='За').click();await wait();
 assert(calls.some(([path,b])=>path.endsWith('/shop_vote')&&b.proposalId===proposalId&&b.approve===true));
 }finally{w.close()}
});

test('site owner enters and exits a full clan from the normal player page',async()=>{
 const id='11111111-1111-4111-8111-111111111111',dom=new JSDOM(clansHtml(false),{runScripts:'outside-only',url:'https://dropso.site/clans'}),w=dom.window,calls=[];let entered=false;
 const wait=()=>new Promise(r=>setTimeout(r,25));const member={id,name:'Alpha',member:true,visitor:true,leader:false,level:1,cxp:0,capacity:5,treasury:100,members:Array.from({length:5},(_,i)=>({id:String(i),login:'Player '+i})),tasks:[],chat:[],requests:[],ends:'2026-11-30',ledger:[],shop:{paidSlots:0,nextSlotCost:50,decorations:{},catalog:[],proposals:[]}};
 w.fetch=async(path,opt)=>{calls.push(path);if(path.endsWith('/owner_enter'))entered=true;if(path.endsWith('/owner_exit'))entered=false;return {ok:true,json:async()=>path.endsWith('/list')?{mine:null,canVisit:true,visit:entered?id:null,clans:[{id,name:'Alpha',level:1,score:0}]}:path.endsWith('/detail')?entered?member:{id,name:'Alpha',level:1,member:false,canVisit:true}:{} }};
 try{w.eval(clansJs);await wait();[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Войти для проверки').click();await wait();assert(calls.some(p=>p.endsWith('/owner_enter')));assert(w.document.body.textContent.includes('проверка без занятия места'));assert(w.document.body.textContent.includes('5/5 участников'));assert([...w.document.querySelectorAll('button')].find(b=>b.textContent==='Пополнить').disabled);assert([...w.document.querySelectorAll('button')].find(b=>b.textContent==='Отправить').disabled);[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Выйти из клана (проверка)').click();await wait();assert(calls.some(p=>p.endsWith('/owner_exit')));assert(!w.document.body.textContent.includes('проверка без занятия места'));}finally{w.close()}
});
