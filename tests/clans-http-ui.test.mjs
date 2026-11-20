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
 installClans(app,{rpc:async(name,body)=>{calls.push({name,body});return {data:{ok:true}}}},user,admin,'https://dropso.site');
 const server=app.listen(0);const base='http://127.0.0.1:'+server.address().port;
 const post=(action,body,headers={},admin=false)=>fetch(base+'/api/'+(admin?'admin':'me')+'/clans/'+action,{method:'POST',headers:{'content-type':'application/json','x-user':'alice',...headers},body:JSON.stringify(body)});
 try{
 assert.equal((await fetch(base+'/clans')).status,401);assert.equal((await post('admin',{}, {},true)).status,403);
 assert.equal((await post('create',{name:'Alpha'},{origin:'https://other.site'})).status,403);
 assert.equal((await post('create',{name:'Alpha',actor:'bob'})).status,400);
 assert.equal((await post('create',{name:'Alpha',avatar:'data:image/svg+xml;base64,PHN2Zz4='})).status,400);
 assert.equal((await post('create',{name:'Alpha'})).status,200);assert.equal(calls.at(-1).body.p_actor,'alice');
 assert.equal((await post('admin',{}, {'x-user':'admin'},true)).status,200);
 }finally{await new Promise(resolve=>server.close(resolve))}
});

test('clan UI safely renders public clan and hides internal tools before membership',async()=>{
 const id='11111111-1111-4111-8111-111111111111',dom=new JSDOM(clansHtml(false),{runScripts:'outside-only',url:'https://dropso.site/clans'}),w=dom.window;
 const wait=()=>new Promise(r=>setTimeout(r,20));
 w.fetch=async(_path,opt)=>{const body=JSON.parse(opt.body);return {ok:true,json:async()=>body.clanId?{id,name:'<img src=x onerror=alert(1)>',member:false,level:1,pending:false}:{mine:null,clans:[{id,name:'<img src=x onerror=alert(1)>',score:0,level:1}]}}};
 try{w.eval(clansJs);await wait();assert(w.document.body.textContent.includes('Создать клан · 150 монет'));assert.equal(w.document.querySelector('img[src="x"]'),null);[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Открыть').click();await wait();assert(w.document.body.textContent.includes('Подать заявку'));assert(!w.document.body.textContent.includes('Общак'));assert(!w.document.body.textContent.includes('Чат клана'));}finally{w.close()}
});
