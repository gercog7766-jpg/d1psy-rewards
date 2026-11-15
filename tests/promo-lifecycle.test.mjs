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
