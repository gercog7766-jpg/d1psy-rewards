import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createRelay} from '../scripts/telegram-relay.mjs';

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
