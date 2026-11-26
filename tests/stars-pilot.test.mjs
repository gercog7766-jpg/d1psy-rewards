import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createRelay} from '../scripts/telegram-relay.mjs';

test('closed real cosmetics editor validates ownership on the server and previews approved IDs safely',async()=>{
 const {default:express}=await import('express'),{JSDOM}=await import('jsdom'),{installStarsProfileCosmetics}=await import('../src/stars-profile-cosmetics.ts');
 const app=express();app.use(express.json());const calls=[];let state={tier:'plus',equipment:{frame:null,background:null,badge:null,title:null}};
 const db={rpc:async(name,body)=>{calls.push({name,body});if(body.p_action==='save')state={...state,equipment:body.p_body};return {data:state,error:null}}};
 const admin=(q,r,next)=>{if(q.get('x-admin')!=='yes')return r.sendStatus(403);r.locals.session={twitchUserId:'owner'};next()};const origin=(q,r,n)=>q.get('origin')==='https://test.local'?n():r.sendStatus(403);installStarsProfileCosmetics(app,db,admin,origin);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,route='/api/admin/monetization/cosmetics',headers={'x-admin':'yes'};
 try{assert.equal((await fetch(base+route)).status,403);assert.equal((await fetch(base+'/admin/monetization/cosmetics')).status,403);
  const page=await (await fetch(base+'/admin/monetization/cosmetics',{headers})).text(),script=await (await fetch(base+route+'-script',{headers})).text();const dom=new JSDOM(page,{url:'https://test.local/admin/monetization/cosmetics',runScripts:'outside-only'}),w=dom.window;
  try{w.fetch=async(url,opts)=>fetch(base+url,{...opts,headers:{...headers,...opts?.headers,Origin:'https://test.local'}});w.eval(script);for(let i=0;i<100&&!w.document.getElementById('frame');i++)await new Promise(r=>setTimeout(r,10));const frame=w.document.getElementById('frame');assert(frame);frame.value='plus_frame';frame.dispatchEvent(new w.Event('change'));assert.equal(w.document.getElementById('face').dataset.starsFrame,'plus_frame');const badge=w.document.getElementById('badge');badge.value='plus_badge';badge.dispatchEvent(new w.Event('change'));assert.match(w.document.getElementById('labels').textContent,/PLUS/);w.document.getElementById('form').dispatchEvent(new w.Event('submit',{cancelable:true}));for(let i=0;i<100&&!calls.some(c=>c.body.p_action==='save');i++)await new Promise(r=>setTimeout(r,10));assert.equal(calls.find(c=>c.body.p_action==='save').body.p_actor,'owner');assert.equal(state.equipment.frame,'plus_frame');}finally{w.close()}
  const invalid=await fetch(base+route,{method:'POST',headers:{...headers,Origin:'https://test.local','Content-Type':'application/json'},body:JSON.stringify({...state.equipment,frame:'<script>'})});assert.equal(invalid.status,400);
 }finally{await new Promise(r=>server.close(r))}
});

test('paid transfer limits preserve free limits, snapshot skin prices and reject exhausted daily budgets',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create table rewards_users(id uuid primary key default gen_random_uuid(),twitch_user_id text,twitch_login text,twitch_display_name text,banned boolean default false);
   create table rewards_admins(twitch_user_id text);create table rewards_bonus_telegram_links(user_id uuid,telegram_id text);create table rewards_monetization_draft(id boolean,config jsonb);
   create table rewards_coin_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,amount integer,transaction_type text,note text,created_at timestamptz default now());
   create table rewards_coin_gifts(id uuid primary key default gen_random_uuid(),sender_id uuid,recipient_id uuid,request_id uuid,amount integer check(amount between 1 and 20),gift_day date,sender_transaction uuid,recipient_transaction uuid,created_at timestamptz,unique(sender_id,request_id));
   create table rewards_friendships(user_low uuid,user_high uuid,status text,requested_by uuid);create table rewards_social_blocks(user_id uuid,blocked_id uuid);
   create table rewards_prizes(id uuid primary key default gen_random_uuid(),name text,sell_price_coins integer);
   create table rewards_wins(id uuid primary key default gen_random_uuid(),user_id uuid,prize_id uuid,source_type text,delivery_status text,choice_status text,item_wear text,item_variant_kind text,won_at timestamptz default now(),choice_at timestamptz);
   create table rewards_skin_gifts(sender_id uuid,recipient_id uuid,gift_day date,request_id uuid,source_win uuid unique,received_win uuid unique,primary key(sender_id,gift_day),unique(sender_id,request_id));
   create function rewards_social_peer(uuid,text) returns uuid language sql as 'select id from public.rewards_users where twitch_login=$2 and id<>$1';create function rewards_social_blocked(uuid,uuid) returns boolean language sql as 'select false';
   insert into rewards_users(twitch_user_id,twitch_login) values('admin','alpha'),('player','bravo');insert into rewards_admins values('admin');insert into rewards_bonus_telegram_links select id,'123' from rewards_users where twitch_user_id='admin';
   insert into rewards_monetization_draft values(true,'{"lite":{"stars":249,"visibility":"admin_test"},"plus":{"stars":399,"visibility":"admin_test"}}');insert into rewards_coin_transactions(user_id,amount) select id,500 from rewards_users;grant select,insert,update on all tables in schema public to service_role;`);
  for(const m of ['20261126180000_stars_pilot.sql','20261126190000_stars_entitlements.sql','20261126200000_stars_gift_limits.sql','20261126210000_stars_profile_cosmetics.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+m,import.meta.url),'utf8'));
  const q=async(sql,params=[])=> (await db.query(sql,params)).rows;const a=(await q("select id from rewards_users where twitch_login='alpha'"))[0].id,b=(await q("select id from rewards_users where twitch_login='bravo'"))[0].id;
  const call=async(n,args)=>(await q('select rewards_'+n+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') r',args))[0].r;
  const gift=(user,peer,amount,key=randomUUID())=>call('send_coin_gift',[user,peer,amount,key]);const skin=(win=null,key=null)=>call('skin_gift',['admin','bravo',win,key]);
  await db.exec("update rewards_stars_pilot_control set enabled=true,fulfillment_ready=true,support_url='https://example.test/support';set role service_role");
  await assert.rejects(gift(a,'bravo',21),/gift_daily_limit/);await gift(a,'bravo',20);await assert.rejects(gift(a,'bravo',1),/gift_daily_limit/);
  async function pay(product){const c=(action,body)=>call('stars_pilot_action',['123',action,body]);const o=await c('create',{product,requestId:randomUUID()});const proof={orderId:o.id,stars:o.stars,currency:'XTR'};await c('precheckout',{...proof,precheckoutId:o.id});await c('receipt',{...proof,chargeId:o.id});return {...proof,chargeId:o.id}}
  const lite=await pay('lite');assert.equal((await call('social_profile',[a,'bravo'])).giftRemaining,80);await gift(a,'bravo',80);await assert.rejects(gift(a,'bravo',1),/gift_daily_limit/);await assert.rejects(gift(b,'alpha',21),/gift_daily_limit/);
  const style=(action,body={})=>call('stars_profile_style',['admin',action,body]);const equip={frame:'lite_frame',background:'lite_background',badge:'lite_badge',title:'lite_title'};
  assert.equal((await style('state')).tier,'lite');await assert.rejects(style('save',{...equip,frame:'plus_frame'}),/cosmetic_not_owned/);assert.deepEqual((await style('save',equip)).equipment,equip);await assert.rejects(call('stars_profile_style',['player','save',equip]),/admin_required/);
  const visible=(viewer)=>call('stars_profile_styles',[viewer,['alpha']]);assert.deepEqual((await visible('admin'))[0].equipment,equip);assert.deepEqual(await visible('player'),[]);
  const items=[];for(const price of [70,80,50]){const p=(await q('insert into rewards_prizes(name,sell_price_coins) values($1,$2) returning id',['skin',price]))[0].id;items.push((await q("insert into rewards_wins(user_id,prize_id,choice_status,delivery_status) values($1,$2,'awaiting_choice','pending') returning id",[a,p]))[0].id)}
  assert.equal((await skin()).remaining,150);const key=randomUUID();await skin(items[0],key);await skin(items[0],key);await skin(items[1],randomUUID());assert.equal((await skin()).remaining,0);await assert.rejects(skin(items[2],randomUUID()),/skin_gift_limit/);
  const plus=await pay('plus');assert.equal((await skin()).remaining,150);await skin(items[2],randomUUID());assert.equal((await skin()).remaining,100);await gift(a,'bravo',100);await assert.rejects(gift(a,'bravo',1),/gift_daily_limit/);
  assert.equal((await style('save',{...equip,frame:'plus_frame'})).equipment.frame,'plus_frame');assert.equal((await visible('admin'))[0].equipment.frame,'plus_frame');
  await call('stars_pilot_action',['123','refund',plus]);assert.equal((await skin()).remaining,0);await call('stars_pilot_action',['123','refund',lite]);assert.equal((await call('social_profile',[a,'bravo'])).giftRemaining,0);assert.equal((await skin()).used,true);
  assert.deepEqual(await visible('admin'),[]);assert.equal((await style('state')).equipment.frame,null);await assert.rejects(style('save',equip),/cosmetic_not_owned/);
  assert.equal((await q('select sum(price_coins)::int n from rewards_skin_gifts'))[0].n,200);assert.equal((await q('select sum(amount)::int n from rewards_coin_transactions'))[0].n,1000);
  const freePrize=(await q("insert into rewards_prizes(name,sell_price_coins) values('free',10) returning id"))[0].id;const freeItems=[];for(let i=0;i<2;i++)freeItems.push((await q("insert into rewards_wins(user_id,prize_id,choice_status,delivery_status) values($1,$2,'awaiting_choice','pending') returning id",[b,freePrize]))[0].id);
  await call('skin_gift',['player','alpha',freeItems[0],randomUUID()]);await assert.rejects(call('skin_gift',['player','alpha',freeItems[1],randomUUID()]),/skin_gift_limit/);
  await db.exec('reset role;set role anon');await assert.rejects(call('stars_gift_tier',[a]),/permission denied/);
 }finally{await db.close()}
});

test('real Stars pilot is closed by default and records only exact approved receipts, independently of wallet',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table rewards_users(id uuid primary key default gen_random_uuid(),twitch_user_id text,banned boolean default false);create table rewards_admins(twitch_user_id text);create table rewards_bonus_telegram_links(user_id uuid,telegram_id text);create table rewards_monetization_draft(id boolean,config jsonb);insert into rewards_users(twitch_user_id) values('admin'),('player');insert into rewards_admins values('admin');insert into rewards_bonus_telegram_links select id,case twitch_user_id when 'admin' then '123' else '456' end from rewards_users;insert into rewards_monetization_draft values(true,'{"lite":{"stars":249,"visibility":"admin_test"}}');grant select on all tables in schema public to service_role;`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261126180000_stars_pilot.sql',import.meta.url),'utf8'));
  const call=async(id,a,body)=>(await db.query('select rewards_stars_pilot_action($1,$2,$3::jsonb) result',[id,a,JSON.stringify(body)])).rows[0].result;
  const request={product:'lite',requestId:randomUUID()};await db.exec('set role service_role');await assert.rejects(call('123','create',request),/pilot_disabled/);await assert.rejects(call('456','create',request),/admin_required/);
  await db.exec("reset role;update rewards_stars_pilot_control set enabled=true,fulfillment_ready=true,support_url='https://example.test/support';set role service_role");
  const o=await call('123','create',request);assert.equal(o.stars,249);assert.equal((await call('123','create',request)).id,o.id);
  const proof={orderId:o.id,stars:249,currency:'XTR'};await assert.rejects(call('456','precheckout',{...proof,precheckoutId:'query'}),/admin_required/);await assert.rejects(call('123','precheckout',{...proof,stars:1,precheckoutId:'query'}),/amount_mismatch/);await assert.rejects(call('123','receipt',{...proof,chargeId:'charge'}),/order_not_approved/);
  assert.equal((await call('123','precheckout',{...proof,precheckoutId:'query'})).state,'approved');await assert.rejects(call('123','precheckout',{...proof,precheckoutId:'different'}),/order_not_payable/);
  await db.exec('reset role;update rewards_stars_pilot_control set enabled=false;set role service_role');
  const payment={...proof,chargeId:'charge'};assert.equal((await call('123','receipt',payment)).state,'paid');assert.equal((await call('123','receipt',payment)).state,'paid');await assert.rejects(call('123','receipt',{...payment,chargeId:'other'}),/request_conflict/);assert.equal((await call('123','prepare_refund',{orderId:o.id})).charge_id,'charge');assert.equal((await call('123','refund',payment)).state,'refunded');assert.equal((await call('123','refund',payment)).state,'refunded');await db.exec('reset role;set role anon');await assert.rejects(call('123','receipt',payment),/permission denied/);
 }finally{await db.close()}
});
test('existing relay checks Stars before approval and only records authenticated Telegram receipts',async()=>{
 const id=randomUUID(),calls=[];let open=false;const relay=createRelay({token:'123:test',webhookSecret:'x'.repeat(32),relaySecret:'y'.repeat(32),webhookUrl:'https://dropso.onrender.com/telegram-webhook',fetcher:async(url,o)=>{const body=JSON.parse(o.body);calls.push({url,body});if(url.endsWith('/relay'))return open?Response.json({ok:true}):Response.json({error:'pilot_disabled'},{status:409});return Response.json({ok:true,result:true})}});
 const query={pre_checkout_query:{id:'query',from:{id:123},invoice_payload:'stars_'+id,currency:'XTR',total_amount:249}};await relay.process(query);assert.equal(calls.at(-1).body.ok,false);open=true;await relay.process(query);assert.equal(calls.at(-1).body.ok,true);
 await relay.process({message:{chat:{id:123,type:'private'},from:{id:123},successful_payment:{invoice_payload:'stars_'+id,currency:'XTR',total_amount:249,telegram_payment_charge_id:'charge'}}});assert.deepEqual(calls.at(-1).body,{action:'receipt',telegramId:'123',orderId:id,chargeId:'charge',stars:249,currency:'XTR'});
});
test('real rights follow verified receipts, renewals, PLUS priority, refund, expiry and the fixed season end',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table rewards_users(id uuid primary key default gen_random_uuid(),twitch_user_id text,banned boolean default false);create table rewards_admins(twitch_user_id text);create table rewards_bonus_telegram_links(user_id uuid,telegram_id text);create table rewards_monetization_draft(id boolean,config jsonb);insert into rewards_users(twitch_user_id) values('admin');insert into rewards_admins values('admin');insert into rewards_bonus_telegram_links select id,'123' from rewards_users;insert into rewards_monetization_draft values(true,'{"lite":{"stars":249,"visibility":"admin_test"},"plus":{"stars":399,"visibility":"admin_test"},"battlePass":{"stars":499,"visibility":"admin_test","season":"S2","days":90}}');grant select on all tables in schema public to service_role;`);
  for(const m of ['20261126180000_stars_pilot.sql','20261126190000_stars_entitlements.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+m,import.meta.url),'utf8'));
  const call=async(a,body)=>(await db.query('select rewards_stars_pilot_action($1,$2,$3::jsonb) result',['123',a,JSON.stringify(body)])).rows[0].result;
  const rights=async(actor='admin')=>(await db.query('select rewards_stars_entitlements($1) result',[actor])).rows[0].result;
  await db.exec("update rewards_stars_pilot_control set enabled=true,fulfillment_ready=true,support_url='https://example.test/support';set role service_role");
  assert.equal((await rights()).tier,'free');
  async function open(product){const o=await call('create',{product,requestId:randomUUID()});return {o,proof:{orderId:o.id,stars:o.stars,currency:'XTR'}}}
  async function pay(product){const {o,proof}=await open(product);await call('precheckout',{...proof,precheckoutId:'q'+o.id});const payment={...proof,chargeId:'c'+o.id};await call('receipt',payment);return payment}
  const lite=await pay('lite'),first=await rights();assert.equal(first.tier,'lite');assert.equal(first.limits.coins,100);
  await pay('lite');assert.equal(Date.parse((await rights()).liteUntil)-Date.parse(first.liteUntil),30*86400000);
  const plus=await pay('plus');assert.equal((await rights()).tier,'plus');assert.equal((await rights()).limits.skins,300);
  await call('refund',plus);assert.equal((await rights()).tier,'lite');assert.equal((await rights('another')).tier,'free');
  const {o,proof}=await open('battlePass');await assert.rejects(call('precheckout',{...proof,precheckoutId:'q'+o.id}),/season_not_open/);
  await db.exec("reset role;insert into rewards_stars_seasons values('S2',now()-interval '1 day',now()+interval '40 days');set role service_role");
  await call('precheckout',{...proof,precheckoutId:'q'+o.id});const pass={...proof,chargeId:'c'+o.id};await call('receipt',pass);assert.equal((await rights()).battlePasses[0].season,'S2');assert(Date.parse((await rights()).battlePasses[0].until)<Date.now()+41*86400000);
  await call('receipt',pass);assert.equal((await rights()).battlePasses.length,1);await call('refund',pass);assert.equal((await rights()).battlePasses.length,0);
  await call('refund',lite);assert(Date.parse((await rights()).liteUntil)<Date.parse(first.liteUntil)+10000);
  await db.exec("reset role;update rewards_stars_pilot_orders set paid_at=now()-interval '70 days' where state='paid';set role service_role");assert.equal((await rights()).tier,'free');
  await db.exec('reset role;set role anon');await assert.rejects(rights(),/permission denied/);
 }finally{await db.close()}
});
