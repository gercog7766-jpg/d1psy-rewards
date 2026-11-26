import {waitForTestServer,stopTestServer} from './fixtures/test-server-ready.mjs';
import {promoRewardBrowserScript} from '../src/promo-rewards.ts';
import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
test('completed promo names can be reused, active duplicates and streamer namespace cannot; archive preserves history',async()=>{
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create table rewards_promo_codes(id integer primary key,code text,active boolean default true,activation_count integer default 0,max_activations integer default 1,expires_at timestamptz);create unique index rewards_promo_codes_code_ci on rewards_promo_codes(lower(code));create table redemption(id integer,promo_id integer references rewards_promo_codes(id));`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261109135354_owner_promo_lifecycle_and_reusable_names.sql',import.meta.url),'utf8'));
 await db.exec(`insert into rewards_promo_codes(id,code) values(1,'hello');insert into redemption values(1,1)`);
 await assert.rejects(db.exec(`insert into rewards_promo_codes(id,code) values(2,'HELLO')`),/unique/i);
 await assert.rejects(db.exec(`update rewards_promo_codes set archived_at=now() where id=1`),/promo_still_active/);
 await db.exec(`update rewards_promo_codes set activation_count=1 where id=1;insert into rewards_promo_codes(id,code) values(2,'Hello');update rewards_promo_codes set archived_at=now() where id=1`);
 assert.equal((await db.query('select count(*)::int n from redemption')).rows[0].n,1);
 await db.exec(`insert into rewards_promo_codes(id,code,expires_at) values(3,'expired',now()-interval '1 hour');insert into rewards_promo_codes(id,code) values(4,'EXPIRED');update rewards_promo_codes set active=false where id=4;insert into rewards_promo_codes(id,code) values(5,'EXPIRED')`);
 for(const code of ['STR-HELLO','str-hello'])await assert.rejects(db.exec(`insert into rewards_promo_codes(id,code) values(8,'${code}')`),/owner_promo_namespace/);
 assert.equal((await db.query(`select count(*)::int n from rewards_promo_codes where code='HELLO' and active`)).rows[0].n,1);await db.close();
});
test('admin markup provides completed-code deletion and keeps active-code cancellation',()=>{
 const src=readFileSync(new URL('../src/promo-ui-fix-hotfix.ts',import.meta.url),'utf8');assert.match(src,/data-promo-delete/);assert.match(src,/data-promo-cancel/);
 const script=src.slice(src.indexOf('const js=`')+10,src.indexOf('`;',src.indexOf('const js=`'))).split('<script>')[1].split('</script>')[0];new Function(script.replace('${promoRewardBrowserScript}',promoRewardBrowserScript));
});

test('promo history is admin-only, scoped to the campaign ID, and safely paginated',async()=>{
 const {default:express}=await import('express');
 const {createClient}=await import('@supabase/supabase-js');
 const {JSDOM}=await import('jsdom');
 const {installPromoHistory}=await import('../src/promo-history.ts');
 const id='187a3146-8298-49fb-b728-0f7d251bfc8b';
 const old='58c4749d-e571-468e-ac3b-9a37045f71ef';
 const calls=[];
 const created='2026-11-15T18:00:00.000Z';
 const db=createClient('https://supabase.test','server-key',{global:{fetch:async url=>{
  const req=new URL(url);
  calls.push(req);
  if(req.pathname.endsWith('/rewards_promo_codes')){
   return Response.json([id,old].includes(req.searchParams.get('id')?.slice(3))?[{code:'REUSED'}]:[]);
  }
  const recent=req.searchParams.get('promo_id')==='eq.'+id;
  return Response.json([{created_at:created,reward_type:recent?'upgrade_skin':'vault_keys',reward_amount:recent?null:4,
    player:{twitch_login:recent?'alice':'bob',twitch_display_name:recent?'<img src=x onerror=alert(1)>':'Bob'},
    prize:recent?{name:'<img> Skin'}:null}],{headers:{'content-range':recent?'50-50/104':'0-0/1'}});
 }}});
 const app=express();
 installPromoHistory(app,db,(req,res,next)=>{
  const role=req.get('x-test-role');
  if(role==='admin')next();else res.sendStatus(role?403:401);
 });
 const server=app.listen(0,'127.0.0.1');
 try{
  await new Promise(resolve=>server.once('listening',resolve));
  const path=key=>'http://127.0.0.1:'+server.address().port+'/admin/promos/'+key+'/redemptions';
  assert.equal((await fetch(path(id))).status,401);
  assert.equal((await fetch(path(id),{headers:{'x-test-role':'viewer'}})).status,403);
  assert.equal(calls.length,0);
  const headers={'x-test-role':'admin'};
  assert.equal((await fetch(path(id)+'?page=0',{headers})).status,400);
  assert.equal((await fetch(path('00000000-0000-0000-0000-000000000000'),{headers})).status,404);
  const response=await fetch(path(id)+'?page=2',{headers});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  const current=new JSDOM(await response.text(),{runScripts:'dangerously'});
  try{
   const doc=current.window.document;
   assert.equal(doc.querySelector('h1').textContent,'REUSED');
   assert.match(doc.querySelector('tbody').textContent,/@alice/);
   assert.match(doc.querySelector('tbody').textContent,/Скин только для апгрейдера · <img> Skin/);
   assert.equal(doc.querySelector('tbody img'),null);
   const time=doc.querySelector('time');
   assert.equal(time.dateTime,created);
   assert.equal(time.textContent,new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'}).format(new Date(created)));
   assert.equal(doc.querySelector('[rel=prev]').getAttribute('href'),'?page=1');
   assert.equal(doc.querySelector('[rel=next]').getAttribute('href'),'?page=3');
  }finally{current.window.close()}
  assert.equal(calls.at(-1).searchParams.get('promo_id'),'eq.'+id);
  assert.equal(calls.at(-1).searchParams.get('offset'),'50');
  assert.equal(calls.at(-1).searchParams.get('limit'),'50');
  assert.equal(calls.at(-1).searchParams.get('order'),'created_at.desc,id.asc');

  const archived=await(await fetch(path(old),{headers})).text();
  assert.match(archived,/@bob/);
  assert.match(archived,/Ключи THE VAULT · 4/);
  assert.doesNotMatch(archived,/@alice/);
  assert.equal(calls.at(-1).searchParams.get('promo_id'),'eq.'+old);
 }finally{await new Promise(resolve=>server.close(resolve))}
});

test('real admin supports Major tokens, validates amounts, and redeems with signed actor and pass errors',{timeout:90000},async()=>{
 const {default:http}=await import('node:http'),{spawn}=await import('node:child_process'),{createHmac}=await import('node:crypto'),{JSDOM}=await import('jsdom');
 const writes=[];const mock=http.createServer(async(q,r)=>{
  r.setHeader('Content-Type','application/json');const path=new URL(q.url,'http://mock').pathname;
  if(path.endsWith('/rewards_admins'))return r.end('{"twitch_user_id":"owner"}');
  if(q.method==='POST'){let raw='';for await(const chunk of q)raw+=chunk;const body=JSON.parse(raw||'{}');writes.push({path,body});
   if(path.endsWith('/rpc/rewards_redeem_owner_promo')){
    if(body.p_actor==='no-pass'){r.statusCode=400;return r.end('{"code":"P0001","message":"major_pass_required"}')}
    return r.end('{"ok":true,"rewardType":"major_tokens","amount":7}');
   }
   r.statusCode=201;
  }
  r.end('[]');
 });await new Promise(r=>mock.listen(0,'127.0.0.1',r));
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const origin='http://127.0.0.1:'+port,secret='major-promo-test';
 const child=spawn(process.execPath,['--import','tsx','src/server-entry.ts'],{env:{...process.env,PORT:String(port),APP_URL:origin,SUPABASE_URL:'http://127.0.0.1:'+mock.address().port,SUPABASE_SECRET_KEY:'test',SESSION_SECRET:secret,REWARDS_ENGINE_ENABLED:'false',TWITCH_CLIENT_ID:'',TWITCH_CLIENT_SECRET:'',TWITCH_EVENTSUB_SECRET:''},stdio:['ignore','ignore','pipe']});
 const headers=actor=>{const p=Buffer.from(JSON.stringify({twitchUserId:actor,exp:Date.now()+60000})).toString('base64url');return {Cookie:'rewards_session='+p+'.'+createHmac('sha256',secret).update(p).digest('base64url'),'Content-Type':'application/json',Origin:origin}};
 const post=(path,body,actor='owner')=>fetch(origin+path,{method:'POST',headers:headers(actor),body:JSON.stringify(body)});
 try{await waitForTestServer(origin,child);
 const html=await(await fetch(origin+'/admin',{headers:headers('owner')})).text();
 const dom=new JSDOM(html,{runScripts:'outside-only',url:origin+'/admin'}),w=dom.window;try{
  assert.equal(w.document.querySelector('#paType option[value="major_tokens"]').textContent,'Жетоны Major Pick’em');
  const requests=[];w.fetch=async(url,o)=>{if(o?.body)requests.push(JSON.parse(o.body));return Response.json({promos:[],prizes:[],ok:true})};
  const script=[...w.document.scripts].find(s=>s.textContent.includes('function ensureControls()'));
  assert(script);w.eval(script.textContent);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const type=w.document.getElementById('paType');type.value='major_tokens';type.dispatchEvent(new w.Event('change'));
  const amount=w.document.getElementById('paCoins');assert.notEqual(amount.style.display,'none');assert.match(amount.getAttribute('aria-label'),/жетонов/);
  amount.value='7';w.document.getElementById('paCode').value='MAJOR7';w.document.getElementById('paMax').value='10';w.document.getElementById('paCreate').click();
  for(let n=0;n<100&&!requests.length;n++)await new Promise(r=>setTimeout(r,5));assert.equal(requests[0].rewardType,'major_tokens');assert.equal(requests[0].rewardAmount,'7');for(let n=0;n<100&&w.document.getElementById('paCreate').disabled;n++)await new Promise(r=>setTimeout(r,5));assert.equal(w.document.getElementById('paCreate').disabled,false);
 }finally{w.close()}
 const payload={code:'MAJOR7',maxActivations:10,rewardType:'major_tokens',rewardAmount:7};
 for(const amount of [0,1.5,100001,'bad'])assert.equal((await post('/api/admin/promos',{...payload,rewardAmount:amount})).status,400);
 assert.equal((await post('/api/admin/promos',payload)).status,200);const saved=writes.find(x=>x.path.endsWith('/rewards_promo_codes')).body;assert.equal(saved.reward_type,'major_tokens');assert.equal(saved.reward_amount,7);assert.equal(saved.coin_amount,null);
 assert.equal((await fetch(origin+'/api/admin/promos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})).status,401);
 assert.equal((await post('/api/me/promo/redeem',{code:'MAJOR7'},'no-pass')).status,409);
 const redeemed=await post('/api/me/promo/redeem',{code:'MAJOR7',userId:'forged'},'player');assert.equal(redeemed.status,200);assert.equal((await redeemed.json()).amount,7);assert.equal(writes.at(-1).body.p_actor,'player');
 }finally{await stopTestServer(child);mock.closeAllConnections();await new Promise(r=>mock.close(r))}
});
