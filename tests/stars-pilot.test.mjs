import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createRelay} from '../scripts/telegram-relay.mjs';

test('Stars relay end-to-end with a local ledger, protected readiness check, invoice, receipt and refund (no real Telegram calls)',async()=>{
 const {default:express}=await import('express'),{installStarsPilot}=await import('../src/telegram-stars-pilot.ts');const db=new PGlite(),env=['BONUS_TELEGRAM_RELAY_SECRET','BONUS_TELEGRAM_BOT_USERNAME'],old=env.map(k=>process.env[k]),secret='q'.repeat(40);process.env[env[0]]=secret;process.env[env[1]]='dropso_test_bot';let server;try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table rewards_users(id uuid primary key default gen_random_uuid(),twitch_user_id text,banned boolean default false);create table rewards_admins(twitch_user_id text);create table rewards_bonus_telegram_links(user_id uuid,telegram_id text);create table rewards_monetization_draft(id boolean,config jsonb);insert into rewards_users(twitch_user_id) values('admin'),('player');insert into rewards_admins values('admin');insert into rewards_bonus_telegram_links select id,case twitch_user_id when 'admin' then '123' else '456' end from rewards_users;insert into rewards_monetization_draft values(true,'{"lite":{"stars":249,"visibility":"admin_test"}}');grant select on all tables in schema public to service_role;`);for(const m of ['20261126180000_stars_pilot.sql','20261126190000_stars_entitlements.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+m,import.meta.url),'utf8'));
  const adapter={from(table){let columns='*',filters=[];return {select(s){columns=s;return this},eq(k,v){filters.push([k,v]);return this},async maybeSingle(){try{const data=(await db.query('select '+columns+' from '+table+' where '+filters.map(([k],i)=>k+'=$'+(i+1)).join(' and '),filters.map(x=>x[1]))).rows[0]||null;return {data,error:null}}catch(e){return {error:e}}},single(){return this.maybeSingle()}}},rpc:async(name,args)=>{try{const values=Object.values(args);const data=(await db.query('select '+name+'('+values.map((_,i)=>'$'+(i+1)).join(',')+') result',values)).rows[0].result;return {data,error:null}}catch(e){return {error:{code:e.code,message:e.message}}}}};
  const app=express();app.use(express.json());installStarsPilot(app,adapter,(_q,r)=>r.sendStatus(403));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,endpoint='/api/monetization/stars/relay',calls=[];let webhook=false;
  const relay=createRelay({token:'123:test',webhookSecret:'w'.repeat(32),relaySecret:secret,webhookUrl:'https://dropso.onrender.com/telegram-webhook',log:{info(){},warn(){}},fetcher:async(url,o={})=>{if(url.startsWith('https://dropso.site'))return url.endsWith('/health')?Response.json({ok:true}):fetch(base+endpoint,o);if(url==='https://api.telegram.org')return Response.json({ok:true});const method=url.split('/').at(-1),body=JSON.parse(o.body);calls.push({method,body});if(method==='getWebhookInfo')return Response.json({ok:true,result:{url:webhook?'https://dropso.onrender.com/telegram-webhook':'',allowed_updates:webhook?['message','callback_query','pre_checkout_query']:[]}});if(method==='setWebhook')webhook=true;return Response.json({ok:true,result:true})}});
  assert.equal((await fetch(base+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'probe'})})).status,403);await relay.setup();assert.equal(relay.health.starsReachable,true);assert.equal(relay.health.starsWebhookReady,true);
  const message=(id,text,update_id=1)=>({update_id,message:{chat:{id,type:'private'},from:{id},text}});await relay.process(message(123,'/start stars_check'));assert.match(calls.at(-1).body.text,/Оплаты закрыты/);await relay.process(message(456,'/start stars_check'));assert.match(calls.at(-1).body.text,/администратору/);await relay.process(message(123,'/start stars_lite',2));assert(!calls.some(c=>c.method==='sendInvoice'));
  await db.exec("update rewards_stars_pilot_control set enabled=true,fulfillment_ready=true,support_url='https://example.test/support'");await relay.process(message(123,'/start stars_lite',3));const invoice=calls.find(c=>c.method==='sendInvoice').body;assert.equal(invoice.currency,'XTR');assert.equal(invoice.prices[0].amount,249);assert.equal(invoice.chat_id,123);assert.equal(invoice.provider_token,undefined);const query={pre_checkout_query:{id:'checkout',from:{id:123},invoice_payload:invoice.payload,currency:'XTR',total_amount:249}};await relay.process({...query,pre_checkout_query:{...query.pre_checkout_query,total_amount:1}});assert.equal(calls.at(-1).body.ok,false);await relay.process(query);assert.equal(calls.at(-1).body.ok,true);
  const paid={message:{chat:{id:123,type:'private'},from:{id:123},successful_payment:{invoice_payload:invoice.payload,currency:'XTR',total_amount:249,telegram_payment_charge_id:'fake-test-charge'}}};await relay.process(paid);await relay.process(paid);assert.equal((await db.query("select count(*)::int n from rewards_stars_pilot_orders where state='paid'")).rows[0].n,1);assert.equal((await db.query("select rewards_stars_entitlements('admin') r")).rows[0].r.tier,'lite');await relay.process(message(123,'/refund_stars '+invoice.payload.slice(6),4));assert.equal(calls.filter(c=>c.method==='refundStarPayment').length,1);assert.equal((await db.query("select rewards_stars_entitlements('admin') r")).rows[0].r.tier,'free');
 }finally{if(server)await new Promise(r=>server.close(r));await db.close();env.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i])}
});

test('S2 cosmetics editor only saves receipt IDs and renders seasonal styling over subscription styling',async()=>{
 const {default:express}=await import('express'),{JSDOM}=await import('jsdom'),{installS2ProfileCosmetics}=await import('../src/s2-profile-cosmetics.ts'),{profileStyleJs}=await import('../src/profile-customization-ui.ts');const app=express();app.use(express.json());const calls=[],frame={id:randomUUID(),kind:'frame',track:'premium',level:40,season:'S2',label:'Полярная рамка'},badge={id:randomUUID(),kind:'badge',track:'free',level:20,season:'S2',label:'<img src=x>'};let state={options:[frame,badge],equipment:{}};const db={rpc:async(name,body)=>{calls.push({name,body});if(body.p_action==='save')state={...state,equipment:Object.fromEntries(Object.entries(body.p_body).filter(([,v])=>v).map(([k,v])=>[k,state.options.find(o=>o.id===v)]))};return {data:state,error:null}}};const admin=(q,r,n)=>{if(q.get('x-admin')!=='yes')return r.sendStatus(403);r.locals.session={twitchUserId:'owner'};n()};const origin=(q,r,n)=>q.get('origin')==='https://test.local'?n():r.sendStatus(403);installS2ProfileCosmetics(app,db,admin,origin);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,path='/api/admin/monetization/s2-cosmetics',headers={'x-admin':'yes',Origin:'https://test.local'};
 try{assert.equal((await fetch(base+path)).status,403);assert.equal((await fetch(base+path+'-script')).status,403);const html=await(await fetch(base+'/admin/monetization/s2-cosmetics',{headers})).text(),script=await(await fetch(base+path+'-script',{headers})).text(),dom=new JSDOM(html,{url:'https://test.local/admin/monetization/s2-cosmetics',runScripts:'outside-only'}),w=dom.window;try{w.fetch=(url,opts)=>fetch(base+url,{...opts,headers:{...headers,...opts?.headers}});w.eval(script);const until=async fn=>{for(let i=0;i<100&&!fn();i++)await new Promise(r=>setTimeout(r,10));assert(fn())};await until(()=>w.document.getElementById('frame'));for(const x of [frame,badge]){const s=w.document.getElementById(x.kind);s.value=x.id;s.dispatchEvent(new w.Event('change'))}assert.equal(w.document.getElementById('face').dataset.s2Frame,'premium-40');assert.match(w.document.getElementById('labels').textContent,/<img/);assert.equal(w.document.querySelector('#labels img'),null);w.document.getElementById('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await until(()=>w.document.getElementById('status').textContent==='Оформление сохранено');assert.deepEqual(calls.at(-1).body.p_body,{frame:frame.id,background:null,badge:badge.id,title:null});assert.equal(calls.at(-1).body.p_actor,'owner');w.eval(profileStyleJs);const box=w.document.getElementById('preview'),face=w.document.getElementById('face');w.applyStyle(box,face,{stars:{frame:'plus_frame'},s2:{frame}});assert.equal(face.dataset.s2Frame,'premium-40');assert.equal(face.dataset.starsFrame,undefined);w.applyStyle(box,face,{stars:{frame:'plus_frame'}});assert.equal(face.dataset.s2Frame,undefined);assert.equal(face.dataset.starsFrame,'plus_frame')}finally{w.close()}
 const invalid=await fetch(base+path,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({frame:'forged',background:null,badge:null,title:null})});assert.equal(invalid.status,400);
 }finally{await new Promise(r=>server.close(r))}
});

test('S2 setup admin screen recommends fixed skins without saving, then submits all authoritative reward slots',async()=>{
 const {default:express}=await import('express'),{JSDOM}=await import('jsdom'),{installSeasonSetup}=await import('../src/season-two-setup.ts'),{initialMonetizationDraft}=await import('../src/monetization-draft.ts');const app=express();app.use(express.json());const calls=[],item=randomUUID();const db={from(name){return {select(){return this},eq(){return this},single:async()=>({data:{revision:0,config:{}},error:null}),maybeSingle:async()=>({data:null,error:null})}},rpc:async(name,body)=>{calls.push({name,body});if(name==='rewards_s2_setup_candidates'){const s=body.p_slots[0];return {data:[{level:s.level,track:s.track,items:[{item_id:item,variant_id:null,name:'<img src=x>',price:s.budget,wear:null,kind:null}]}],error:null}}return {data:{selected:1,skinSlots:40,enabled:false},error:null}}};const auth=(q,r,n)=>{if(q.get('x-admin')!=='yes')return r.sendStatus(403);r.locals.session={twitchUserId:'owner'};n()};installSeasonSetup(app,db,auth,'https://test.local',()=>initialMonetizationDraft());const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,path='/api/admin/monetization/s2-setup',headers={'x-admin':'yes',Origin:'https://test.local'};
 try{assert.equal((await fetch(base+path)).status,403);assert.equal((await fetch(base+path+'/candidates?level=1&track=free&budget=1',{headers})).status,400);const html=await (await fetch(base+'/admin/monetization/s2-setup',{headers})).text(),script=await (await fetch(base+path+'-script',{headers})).text(),dom=new JSDOM(html,{url:'https://test.local/admin/monetization/s2-setup',runScripts:'outside-only'}),w=dom.window;
 try{w.fetch=(url,opts)=>fetch(base+url,{...opts,headers:{...headers,...opts?.headers}});w.eval(script);const until=async fn=>{for(let i=0;i<100&&!fn();i++)await new Promise(r=>setTimeout(r,10));assert(fn())};await until(()=>!w.document.getElementById('recommend').disabled);w.document.getElementById('recommend').click();await until(()=>w.document.getElementById('summary').textContent.includes('Выбрано скинов: 1'));assert.equal(calls.filter(x=>x.name==='rewards_s2_setup_save').length,0);assert.equal(w.document.querySelector('#rows img'),null);w.document.getElementById('start').value='2026-12-01';w.document.getElementById('start').dispatchEvent(new w.Event('change'));w.document.getElementById('save').click();await until(()=>w.document.getElementById('status').textContent.includes('Сохранено:'));const write=calls.find(x=>x.name==='rewards_s2_setup_save').body;assert.equal(write.p_actor,'owner');assert.equal(write.p_rows.length,100);assert.equal(write.p_rows.filter(x=>x.item_id).length,1);assert.equal(write.p_rows.find(x=>x.item_id).expected_price,write.p_rows.find(x=>x.item_id).budget)}finally{w.close()}
 }finally{await new Promise(r=>server.close(r))}
});

test('S2 setup uses exact unlimited shop variants, blocks unsuitable final gloves and saves only a disabled configuration',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table rewards_users(id uuid primary key default gen_random_uuid(),twitch_user_id text,banned boolean default false,participation_restricted boolean default false);create table rewards_admins(twitch_user_id text);create table rewards_streamers(twitch_broadcaster_id text,is_primary boolean);create table rewards_bonus_telegram_links(user_id uuid,telegram_id text);create table rewards_monetization_draft(id boolean,revision int,config jsonb);create table rewards_prizes(id uuid primary key default gen_random_uuid(),name text,unlimited boolean,sell_price_coins int,image_url text,status text,draw_weight int,drop_shop_item_id uuid,drop_shop_variant_id uuid,drop_wear text,drop_kind text);create unique index snapshot_idx on rewards_prizes(drop_shop_item_id,drop_shop_variant_id,sell_price_coins) nulls not distinct where drop_shop_item_id is not null;create table rewards_drop_shop_pool(item_id uuid,variant_id uuid,name text,image_url text,price int,wear text,kind text);create table rewards_wins(id uuid primary key default gen_random_uuid(),user_id uuid,prize_id uuid,source_type text,item_wear text,item_variant_kind text);create table rewards_coin_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,amount int,transaction_type text,note text);insert into rewards_users(twitch_user_id) values('admin'),('player');insert into rewards_admins values('admin');insert into rewards_monetization_draft values(true,0,'{}');grant select,insert,update on all tables in schema public to service_role;`);
  for(const m of ['20261126180000_stars_pilot.sql','20261126190000_stars_entitlements.sql','20261126230000_s2_live_claims.sql','20261127000000_s2_setup.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+m,import.meta.url),'utf8'));
  const q=async(s,p=[])=>(await db.query(s,p)).rows;const call=async(n,args)=>(await q('select rewards_'+n+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') r',args))[0].r;
  const low=randomUUID(),skin=randomUUID(),gloves=randomUUID(),wrong=randomUUID(),variant=randomUUID();for(const [id,v,name,price,wear,kind] of [[low,null,'Low skin',10,null,null],[skin,null,'Fixed Skin',550,null,null],[gloves,variant,'Перчатки | Test',2500,'BS','normal'],[wrong,null,'AK Test',2500,null,null]])await q('insert into rewards_drop_shop_pool values($1,$2,$3,\'https://example.test/x\',$4,$5,$6)',[id,v,name,price,wear,kind]);
  const rows=Array.from({length:50},(_,i)=>['free','premium'].map(track=>({level:i+1,track,kind:'coins',label:'Coins',budget:2,item_id:null,variant_id:null,expected_price:null}))).flat();for(const [level,track,budget,item_id,variant_id]of [[1,'free',10,low,null],[50,'free',550,skin,null],[50,'premium',2500,gloves,variant]])Object.assign(rows.find(x=>x.level===level&&x.track===track),{kind:'skin',label:'Skin',budget,item_id,variant_id,expected_price:budget});
  const start=(await q("select ((now() at time zone 'Europe/Moscow')::date+1)::text as day"))[0].day;await db.exec('set role service_role');const recommended=await call('s2_setup_candidates',['admin',rows.filter(x=>x.kind==='skin').map(({level,track,budget})=>({level,track,budget})),'']);assert.equal(recommended.find(x=>x.level===50&&x.track==='premium').items.length,1);assert.equal(recommended.find(x=>x.level===50&&x.track==='premium').items[0].item_id,gloves);await assert.rejects(call('s2_setup_candidates',['player',[],'']),/admin_required/);
  const save=(revision,items=rows)=>call('s2_setup_save',['admin','S2',start,revision,0,items]);const invalid=structuredClone(rows);invalid.find(x=>x.level===50&&x.track==='premium').item_id=wrong;invalid.find(x=>x.level===50&&x.track==='premium').variant_id=null;await assert.rejects(save(-1,invalid),/skin_outside_budget/);const stale=structuredClone(rows);stale.find(x=>x.level===50&&x.track==='free').expected_price=549;await assert.rejects(save(-1,stale),/skin_price_changed/);assert.equal((await q('select count(*)::int n from rewards_s2_live_config'))[0].n,0);assert.equal((await q('select count(*)::int n from rewards_prizes'))[0].n,0);
  const partial=structuredClone(rows);partial.find(x=>x.level===50&&x.track==='premium').item_id=null;partial.find(x=>x.level===50&&x.track==='premium').variant_id=null;partial.find(x=>x.level===50&&x.track==='premium').expected_price=null;const first=await save(-1,partial);assert.equal(first.selected,2);assert.equal(first.complete,false);assert.equal(first.enabled,false);assert.equal((await q('select count(*)::int n from rewards_s2_live_rewards'))[0].n,100);await assert.rejects(save(-1),/setup_conflict/);const second=await save(0);assert.equal(second.complete,true);assert.equal(second.selected,3);assert.equal(await call('s2_live_ready',['S2']),false);await assert.rejects(db.query('update rewards_s2_live_config set enabled=true'),/permission denied/);assert.equal((await q("select count(*)::int n from rewards_prizes where status='disabled' and unlimited"))[0].n,3);assert.equal((await q('select count(*)::int n from rewards_coin_transactions'))[0].n,0);assert.equal((await q('select count(*)::int n from rewards_wins'))[0].n,0);assert.equal((await q('select enabled from rewards_stars_pilot_control'))[0].enabled,false);
  await db.exec('reset role;update rewards_s2_live_config set enabled=true;set role service_role');await assert.rejects(db.query("update rewards_stars_seasons set starts_at=starts_at+interval '1 day',ends_at=ends_at+interval '1 day'"),/season_catalog_frozen/);await assert.rejects(save(1),/season_catalog_frozen/);await db.exec('reset role;set role anon');await assert.rejects(save(1),/permission denied/);
 }finally{await db.close()}
});

test('S2 live routes stay admin-only and do not read or mutate test profiles or wallets when disabled',async()=>{
 const {default:express}=await import('express'),{installLiveSeason}=await import('../src/season-two-live.ts');const app=express(),calls=[];app.use(express.json());const db={from(name){calls.push(name);assert.equal(name,'rewards_s2_live_config');return {select(){return this},eq(){return this},limit:async()=>({data:[],error:null})}}};const admin=(q,r,n)=>{if(q.get('x-admin')!=='yes')return r.sendStatus(403);r.locals.session={twitchUserId:'owner'};n()};installLiveSeason(app,db,admin,'https://test.local');const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,path='/api/admin/monetization/s2-live',headers={'x-admin':'yes',Origin:'https://test.local','Content-Type':'application/json'};
 try{assert.equal((await fetch(base+'/admin/monetization/s2-live')).status,403);const html=await (await fetch(base+'/admin/monetization/s2-live',{headers})).text();assert.match(html,/CLOSED LIVE/);const script=await (await fetch(base+path+'-script',{headers})).text();new Function(script);assert.match(script,/\/api\/admin\/monetization\/s2-live/);const post=body=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});assert.equal((await post({action:'sync',sp:999999})).status,400);const r=await post({action:'sync'});assert.equal(r.status,409);assert.equal((await r.json()).error,'season_not_ready');assert.deepEqual(calls,['rewards_s2_live_config'])}finally{await new Promise(r=>server.close(r))}
});

test('real S2 claims use fixed rewards, stored progress and an exact paid season; checkout is closed until ready',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table rewards_users(id uuid primary key default gen_random_uuid(),twitch_user_id text,banned boolean default false,participation_restricted boolean default false);create table rewards_admins(twitch_user_id text);create table rewards_streamers(twitch_broadcaster_id text,is_primary boolean);create table rewards_bonus_telegram_links(user_id uuid,telegram_id text);create table rewards_monetization_draft(id boolean,config jsonb);create table rewards_prizes(id uuid primary key default gen_random_uuid(),name text,unlimited boolean,sell_price_coins int);create table rewards_wins(id uuid primary key default gen_random_uuid(),user_id uuid,prize_id uuid,source_type text,item_wear text,item_variant_kind text);create table rewards_coin_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,amount int,transaction_type text,note text);insert into rewards_users(twitch_user_id) values('admin'),('player');insert into rewards_admins values('admin');insert into rewards_bonus_telegram_links select id,'123' from rewards_users where twitch_user_id='admin';insert into rewards_monetization_draft values(true,'{"battlePass":{"stars":499,"visibility":"admin_test","season":"S2","days":90}}');grant select,insert,update on all tables in schema public to service_role;`);
  await db.exec('alter table rewards_users add column twitch_login text;update rewards_users set twitch_login=twitch_user_id');
  for(const m of ['20261126180000_stars_pilot.sql','20261126190000_stars_entitlements.sql','20261126230000_s2_live_claims.sql','20261127010000_s2_profile_cosmetics.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+m,import.meta.url),'utf8'));
  const q=async(s,p=[])=>(await db.query(s,p)).rows;const call=async(n,args)=>(await q('select rewards_'+n+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') r',args))[0].r;const a=(await q("select id from rewards_users where twitch_user_id='admin'"))[0].id;
  await db.exec("insert into rewards_stars_seasons select 'S2',((now() at time zone 'Europe/Moscow')::date-89)::timestamp at time zone 'Europe/Moscow',(((now() at time zone 'Europe/Moscow')::date-89)::timestamp at time zone 'Europe/Moscow')+interval '2160 hours';insert into rewards_s2_live_config values('S2',false);update rewards_stars_pilot_control set enabled=true,fulfillment_ready=true,support_url='https://example.test/support';set role service_role");
  assert.equal(await call('s2_live_ready',['S2']),false);await assert.rejects(call('s2_live_claim',['admin','S2','free',1]),/season_not_ready/);
  const action=(act,body)=>call('stars_pilot_action',['123',act,body]),o=await action('create',{product:'battlePass',requestId:randomUUID()}),proof={orderId:o.id,stars:499,currency:'XTR'};await assert.rejects(action('precheckout',{...proof,precheckoutId:'q'}),/season_not_ready/);
  await db.exec('reset role');const skin=(await q("insert into rewards_prizes(name,unlimited,sell_price_coins) values('Fixed Skin',true,550) returning id"))[0].id,gloves=(await q("insert into rewards_prizes(name,unlimited,sell_price_coins) values('Fixed Gloves',true,2500) returning id"))[0].id;
  await db.exec("insert into rewards_s2_live_rewards(season,level,track,kind,label,value) select 'S2',i,t,'coins','Coins',2 from generate_series(1,49)i cross join unnest(array['free','premium'])t;update rewards_s2_live_rewards set kind='frame',label='S2 Frame',value=0 where level=2 and track='premium';update rewards_s2_live_rewards set kind='badge',label='S2 Badge',value=0 where level=2 and track='free'");
  await q("insert into rewards_s2_live_rewards values('S2',50,'free','skin','Fixed Skin',550,$1,'FT','normal'),('S2',50,'premium','skin','Fixed Gloves',2500,$2,'BS','normal')",[skin,gloves]);await db.exec("update rewards_s2_live_config set enabled=true;set role service_role");assert.equal(await call('s2_live_ready',['S2']),true);
  await db.exec('reset role');await assert.rejects(db.query("update rewards_s2_live_rewards set label='Changed' where level=1"),/season_catalog_frozen/);await db.exec('set role service_role');
  const claim=(track,level)=>call('s2_live_claim',['admin','S2',track,level]);await assert.rejects(claim('free',1),/level_locked/);await assert.rejects(call('s2_live_claim',['player','S2','free',1]),/admin_required/);
  const start=(await q("select (starts_at at time zone 'Europe/Moscow')::date::text as day from rewards_stars_seasons where season='S2'"))[0].day;const state={season:'S2',start,days:{1:{mask:7}},weeks:{1:{mask:7}},months:[{mask:0},{mask:0},{mask:0}]};assert.equal(await call('s2_live_level',[state]),2);await q('insert into rewards_s2_live_profiles(user_id,season,state) values($1,\'S2\',$2)',[a,state]);
  const free=await claim('free',1);assert.equal(free.value,2);assert.equal((await claim('free',1)).coin_transaction,free.coin_transaction);await assert.rejects(claim('premium',1),/premium_required/);await assert.rejects(claim('free',3),/level_locked/);
  await action('precheckout',{...proof,precheckoutId:'q'});const payment={...proof,chargeId:'paid'};await action('receipt',payment);const frame=await claim('premium',2),badge=await claim('free',2);assert.equal(frame.kind,'frame');assert.equal(badge.kind,'badge');const style=(action,body={})=>call('s2_profile_style',['admin',action,body]);const equip={frame:frame.cosmetic_id,background:null,badge:badge.cosmetic_id,title:null};assert.equal((await style('state')).options.length,2);await assert.rejects(style('save',{...equip,frame:free.cosmetic_id}),/cosmetic_not_owned/);await assert.rejects(style('save',{...equip,title:badge.cosmetic_id}),/cosmetic_not_owned/);assert.equal((await style('save',equip)).equipment.frame.id,frame.cosmetic_id);assert.equal((await call('s2_profile_styles',['admin',['admin']]))[0].equipment.badge.id,badge.cosmetic_id);assert.deepEqual(await call('s2_profile_styles',['player',['admin']]),[]);await assert.rejects(call('s2_profile_style',['player','save',equip]),/admin_required/);assert.equal((await claim('premium',1)).value,2);
  const full={season:'S2',start,days:Object.fromEntries(Array.from({length:90},(_,i)=>[i+1,{mask:7}])),weeks:Object.fromEntries(Array.from({length:13},(_,i)=>[i+1,{mask:i<7?511:255}])),months:[{mask:7},{mask:7},{mask:7}]};assert.equal(await call('s2_live_level',[full]),50);full.days[90].mask=6;assert.equal(await call('s2_live_level',[full]),49);full.days[90].mask=7;await q("update rewards_s2_live_profiles set state=$1 where user_id=$2",[full,a]);
  const f=await claim('free',50),p=await claim('premium',50);assert.equal((await q('select prize_id from rewards_wins where id=$1',[p.win_id]))[0].prize_id,gloves);assert.equal((await claim('free',50)).win_id,f.win_id);assert.equal((await q('select count(*)::int n from rewards_wins'))[0].n,2);
  await db.exec("reset role;update rewards_stars_seasons set starts_at=starts_at-interval '2 days',ends_at=ends_at-interval '2 days';update rewards_stars_pilot_orders set season_ends_at=season_ends_at-interval '2 days',approved_at=approved_at-interval '2 days';update rewards_s2_live_profiles p set state=jsonb_set(p.state,'{start}',to_jsonb((s.starts_at at time zone 'Europe/Moscow')::date::text)) from rewards_stars_seasons s where p.season=s.season;set role service_role");assert.equal((await style('state')).equipment.frame.id,frame.cosmetic_id);await action('refund',payment);await assert.rejects(claim('premium',3),/premium_required/);const after=await style('state');assert.equal(after.equipment.frame,undefined);assert.equal(after.equipment.badge.id,badge.cosmetic_id);assert.equal(after.options.length,1);assert.equal((await q('select sum(amount)::int n from rewards_coin_transactions'))[0].n,4);await db.exec('reset role;set role anon');await assert.rejects(claim('free',2),/permission denied/);
 }finally{await db.close()}
});

test('PLUS clan theme route is closed, strict, and binds the administrator rather than request input',async()=>{
 const {default:express}=await import('express'),{installClans}=await import('../src/clans.ts');const app=express(),calls=[];app.use(express.json());const db={rpc:async(name,body)=>{calls.push({name,body});return {data:{theme:body.p_theme,canEdit:true},error:null}}};
 const admin=(q,r,n)=>{if(q.get('x-admin')!=='yes')return r.sendStatus(403);r.locals.session={twitchUserId:'owner'};n()};installClans(app,db,admin,admin,'https://test.local');const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const route='http://127.0.0.1:'+server.address().port+'/api/admin/monetization/plus/clan',clanId=randomUUID(),post=(body,headers={})=>fetch(route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}),good={'x-admin':'yes',Origin:'https://test.local'};
 try{assert.equal((await post({clanId,theme:'aurora'})).status,403);assert.equal((await post({clanId,theme:'aurora'},{'x-admin':'yes'})).status,403);assert.equal((await post({clanId,theme:'evil'},good)).status,400);assert.equal((await post({clanId,theme:'aurora',actor:'other'},good)).status,400);assert.equal((await post({clanId,theme:'aurora'},good)).status,200);assert.deepEqual(calls.at(-1),{name:'rewards_stars_clan_style',body:{p_actor:'owner',p_clan:clanId,p_action:'save',p_theme:'aurora'}})}finally{await new Promise(r=>server.close(r))}
});

test('PLUS statistics admin page binds the actor, bounds periods and renders private data as text',async()=>{
 const {default:express}=await import('express'),{JSDOM}=await import('jsdom'),{installStarsPlusPerks}=await import('../src/stars-plus-perks.ts');const app=express(),calls=[];let active=true;
 const db={rpc:async(name,body)=>{calls.push({name,body});return active?{data:{from:'2026-11-01',through:'2026-11-26',totals:{credited:10,debited:5,net:5,operations:2,activeDays:1},daily:[{day:'2026-11-26',credited:10,debited:5}],categories:[{category:'<img src=x>',credited:10,debited:5,operations:2}],live:[{channel:'<script>',seconds:3600,messages:100,timeCoins:5,chatCoins:2,streakCoins:0}]},error:null}:{error:{message:'plus_required'}}}};
 const admin=(q,r,n)=>{if(q.get('x-admin')!=='yes')return r.sendStatus(403);r.locals.session={twitchUserId:'owner'};n()};installStarsPlusPerks(app,db,admin);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,api='/api/admin/monetization/plus/statistics',headers={'x-admin':'yes'};
 try{assert.equal((await fetch(base+api+'?days=7')).status,403);assert.equal((await fetch(base+api+'?days=7&actor=other',{headers})).status,400);assert.equal((await fetch(base+api+'?days=365',{headers})).status,400);active=false;assert.equal((await fetch(base+api+'?days=7',{headers})).status,403);active=true;
 const html=await (await fetch(base+'/admin/monetization/plus/statistics',{headers})).text(),script=await (await fetch(base+api+'-script',{headers})).text(),dom=new JSDOM(html,{url:'https://test.local/admin/monetization/plus/statistics',runScripts:'outside-only'}),w=dom.window;
 try{w.fetch=(url,opts)=>fetch(base+url,{...opts,headers});w.eval(script);for(let i=0;i<100&&w.document.getElementById('content').hidden;i++)await new Promise(r=>setTimeout(r,10));assert.equal(w.document.getElementById('content').hidden,false);assert.equal(w.document.querySelector('#categories img'),null);assert.match(w.document.querySelector('#live').textContent,/<script>/);assert.equal(calls.at(-1).body.p_actor,'owner');assert.equal(calls.at(-1).body.p_days,30);w.document.querySelector('[data-days="90"]').click();for(let i=0;i<100&&w.document.getElementById('content').hidden;i++)await new Promise(r=>setTimeout(r,10));assert.equal(calls.at(-1).body.p_days,90)}finally{w.close()}
 }finally{await new Promise(r=>server.close(r))}
});

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
   create table rewards_clans(id uuid primary key default gen_random_uuid(),owner_id uuid,name text);
   create table rewards_live_economy_daily(user_id uuid,day date,broadcaster text,seconds bigint,messages bigint,time_coins bigint,chat_coins bigint,streak_coins bigint,primary key(user_id,day,broadcaster));
   create function rewards_social_peer(uuid,text) returns uuid language sql as 'select id from public.rewards_users where twitch_login=$2 and id<>$1';create function rewards_social_blocked(uuid,uuid) returns boolean language sql as 'select false';
   insert into rewards_users(twitch_user_id,twitch_login) values('admin','alpha'),('player','bravo');insert into rewards_admins values('admin');insert into rewards_bonus_telegram_links select id,'123' from rewards_users where twitch_user_id='admin';
   insert into rewards_monetization_draft values(true,'{"lite":{"stars":249,"visibility":"admin_test"},"plus":{"stars":399,"visibility":"admin_test"}}');insert into rewards_coin_transactions(user_id,amount) select id,500 from rewards_users;grant select,insert,update on all tables in schema public to service_role;`);
  for(const m of ['20261126180000_stars_pilot.sql','20261126190000_stars_entitlements.sql','20261126200000_stars_gift_limits.sql','20261126210000_stars_profile_cosmetics.sql','20261126220000_stars_plus_perks.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+m,import.meta.url),'utf8'));
  const q=async(sql,params=[])=> (await db.query(sql,params)).rows;const a=(await q("select id from rewards_users where twitch_login='alpha'"))[0].id,b=(await q("select id from rewards_users where twitch_login='bravo'"))[0].id;
  const call=async(n,args)=>(await q('select rewards_'+n+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') r',args))[0].r;
  const gift=(user,peer,amount,key=randomUUID())=>call('send_coin_gift',[user,peer,amount,key]);const skin=(win=null,key=null)=>call('skin_gift',['admin','bravo',win,key]);
  await db.exec("update rewards_stars_pilot_control set enabled=true,fulfillment_ready=true,support_url='https://example.test/support';set role service_role");
  await assert.rejects(gift(a,'bravo',21),/gift_daily_limit/);await gift(a,'bravo',20);await assert.rejects(gift(a,'bravo',1),/gift_daily_limit/);
  async function pay(product){const c=(action,body)=>call('stars_pilot_action',['123',action,body]);const o=await c('create',{product,requestId:randomUUID()});const proof={orderId:o.id,stars:o.stars,currency:'XTR'};await c('precheckout',{...proof,precheckoutId:o.id});await c('receipt',{...proof,chargeId:o.id});return {...proof,chargeId:o.id}}
  const lite=await pay('lite');assert.equal((await call('social_profile',[a,'bravo'])).giftRemaining,80);await gift(a,'bravo',80);await assert.rejects(gift(a,'bravo',1),/gift_daily_limit/);await assert.rejects(gift(b,'alpha',21),/gift_daily_limit/);
  await assert.rejects(call('stars_plus_statistics',['admin',7]),/plus_required/);
  const style=(action,body={})=>call('stars_profile_style',['admin',action,body]);const equip={frame:'lite_frame',background:'lite_background',badge:'lite_badge',title:'lite_title'};
  assert.equal((await style('state')).tier,'lite');await assert.rejects(style('save',{...equip,frame:'plus_frame'}),/cosmetic_not_owned/);assert.deepEqual((await style('save',equip)).equipment,equip);await assert.rejects(call('stars_profile_style',['player','save',equip]),/admin_required/);
  const visible=(viewer)=>call('stars_profile_styles',[viewer,['alpha']]);assert.deepEqual((await visible('admin'))[0].equipment,equip);assert.deepEqual(await visible('player'),[]);
  const items=[];for(const price of [70,80,50]){const p=(await q('insert into rewards_prizes(name,sell_price_coins) values($1,$2) returning id',['skin',price]))[0].id;items.push((await q("insert into rewards_wins(user_id,prize_id,choice_status,delivery_status) values($1,$2,'awaiting_choice','pending') returning id",[a,p]))[0].id)}
  assert.equal((await skin()).remaining,150);const key=randomUUID();await skin(items[0],key);await skin(items[0],key);await skin(items[1],randomUUID());assert.equal((await skin()).remaining,0);await assert.rejects(skin(items[2],randomUUID()),/skin_gift_limit/);
  const plus=await pay('plus');assert.equal((await skin()).remaining,150);await skin(items[2],randomUUID());assert.equal((await skin()).remaining,100);await gift(a,'bravo',100);await assert.rejects(gift(a,'bravo',1),/gift_daily_limit/);
  const clan=(await q("insert into rewards_clans(owner_id,name) values($1,'Test') returning id",[a]))[0].id,otherClan=(await q("insert into rewards_clans(owner_id,name) values($1,'Other') returning id",[b]))[0].id;
  const appearance=(actor,clanId,action='state',theme=null)=>call('stars_clan_style',[actor,clanId,action,theme]);assert.equal((await appearance('admin',clan)).canEdit,true);assert.equal((await appearance('admin',clan,'save','aurora')).theme,'aurora');assert.equal(await appearance('player',clan),null);await assert.rejects(appearance('admin',otherClan,'save','royal'),/leader_required/);await assert.rejects(appearance('admin',clan,'save','bad'),/invalid_theme/);
  await q("insert into rewards_live_economy_daily values($1,(now() at time zone 'Europe/Moscow')::date,'player',3600,100,5,2,0),($2,(now() at time zone 'Europe/Moscow')::date,'admin',7200,300,10,6,0)",[a,b]);
  const stats=await call('stars_plus_statistics',['admin',7]);assert.equal(stats.daily.length,7);assert.equal(stats.totals.credited,500);assert.equal(stats.totals.debited,200);assert.equal(stats.live.length,1);assert.equal(stats.live[0].channel,'bravo');assert.equal(stats.live[0].seconds,3600);await assert.rejects(call('stars_plus_statistics',['player',7]),/plus_required/);await assert.rejects(call('stars_plus_statistics',['admin',8]),/invalid_period/);
  assert.equal((await style('save',{...equip,frame:'plus_frame'})).equipment.frame,'plus_frame');assert.equal((await visible('admin'))[0].equipment.frame,'plus_frame');
  await call('stars_pilot_action',['123','refund',plus]);assert.equal((await skin()).remaining,0);assert.deepEqual(await appearance('admin',clan),{theme:null,canEdit:false});await assert.rejects(call('stars_plus_statistics',['admin',7]),/plus_required/);await call('stars_pilot_action',['123','refund',lite]);assert.equal((await call('social_profile',[a,'bravo'])).giftRemaining,0);assert.equal((await skin()).used,true);
  assert.deepEqual(await visible('admin'),[]);assert.equal((await style('state')).equipment.frame,null);await assert.rejects(style('save',equip),/cosmetic_not_owned/);
  assert.equal((await q('select sum(price_coins)::int n from rewards_skin_gifts'))[0].n,200);assert.equal((await q('select sum(amount)::int n from rewards_coin_transactions'))[0].n,1000);
  const freePrize=(await q("insert into rewards_prizes(name,sell_price_coins) values('free',10) returning id"))[0].id;const freeItems=[];for(let i=0;i<2;i++)freeItems.push((await q("insert into rewards_wins(user_id,prize_id,choice_status,delivery_status) values($1,$2,'awaiting_choice','pending') returning id",[b,freePrize]))[0].id);
  await call('skin_gift',['player','alpha',freeItems[0],randomUUID()]);await assert.rejects(call('skin_gift',['player','alpha',freeItems[1],randomUUID()]),/skin_gift_limit/);
  await db.exec('reset role');
  await db.exec("insert into rewards_bonus_telegram_links select id,'456' from rewards_users where twitch_user_id='player'");
  for(const m of ['20261128010000_membership_player_checkout.sql','20261128020000_membership_player_perks.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+m,import.meta.url),'utf8'));
  const playerAction=(action,body)=>call('stars_pilot_action',['456',action,body]);
  await db.exec('set role service_role');
  await assert.rejects(playerAction('create',{product:'plus',requestId:randomUUID()}),/product_not_in_test/);
  await db.exec("reset role;update rewards_monetization_draft set config=jsonb_set(config,'{plus,visibility}', to_jsonb('players'::text));set role service_role");
  const playerOrder=await playerAction('create',{product:'plus',requestId:randomUUID()});
  const playerProof={orderId:playerOrder.id,stars:399,currency:'XTR'};
  await playerAction('precheckout',{...playerProof,precheckoutId:'player-q'});
  const playerPayment={...playerProof,chargeId:'player-charge'};await playerAction('receipt',playerPayment);
  assert.equal(await call('stars_gift_tier',[b]),'plus');
  assert.equal((await call('stars_profile_style',['player','save',{...equip,frame:'plus_frame'}])).equipment.frame,'plus_frame');
  assert.equal((await call('stars_profile_styles',['admin',['bravo']])).find(x=>x.login==='bravo').equipment.frame,'plus_frame');
  assert.equal((await call('stars_plus_statistics',['player',7])).daily.length,7);
  assert.equal((await appearance('player',otherClan,'save','royal')).theme,'royal');
  await assert.rejects(appearance('player',clan,'save','royal'),/leader_required/);
  await assert.rejects(playerAction('prepare_refund',{orderId:playerOrder.id}),/admin_required/);
  await playerAction('refund',playerPayment);
  assert.equal(await call('stars_gift_tier',[b]),'free');
  assert.equal((await call('stars_profile_style',['player','state',{}])).equipment.frame,null);
  await assert.rejects(call('stars_plus_statistics',['player',7]),/plus_required/);
  assert.equal((await appearance('player',otherClan)).theme,null);
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


test('membership preview reflects live entitlements and only opens explicitly enabled administrator checkout',async()=>{
 const {membershipPageHtml,membershipPageJs}=await import('../src/membership-page.ts');
 const {JSDOM}=await import('jsdom');
 for(const scenario of [
  {tier:'free'},
  {tier:'lite'},
  {tier:'plus'},
  {tier:'lite',visibility:'hidden'},
  {tier:'free',linked:false},
  {tier:'free',enabled:false},
  {tier:'free',fulfillment:false},
  {tier:'free',relay:false},
  {tier:'free',demo:true}
 ]){
  const dom=new JSDOM(membershipPageHtml,{url:'https://dropso.site/admin/monetization/membership-page',runScripts:'outside-only'});
  try{
   const w=dom.window,d=w.document;
   const draft={config:{lite:{stars:249,visibility:scenario.visibility??'admin_test'},plus:{stars:399,visibility:scenario.visibility??'admin_test'}}};
   const stars={entitlements:{tier:scenario.tier,expiresAt:new Date(Date.now()+30*86400000).toISOString()},control:{enabled:scenario.enabled??true,fulfillment_ready:scenario.fulfillment??true,support_url:'https://t.me/dropso_cs2'},linked:scenario.linked??true,relayConfigured:scenario.relay??true,botUsername:'dropso_test_bot'};
   w.fetch=async url=>({ok:true,json:async()=>url.endsWith('/draft')?draft:stars});
   if(scenario.demo)w.__DROPSO_MEMBERSHIP_DEMO__={draft,stars};
   w.eval(membershipPageJs);
   await new Promise(resolve=>setImmediate(resolve));
   const el=id=>d.getElementById(id);
   assert.equal(el('currentTier').textContent,scenario.tier==='free'?'FREE':'DROPSO '+scenario.tier.toUpperCase());
   assert.equal(el('currentActions').hidden,scenario.tier==='free');
   assert.equal(el('cta-lite').disabled,scenario.tier==='plus');
   if(scenario.tier!=='free'){
    assert.equal(el('renew').dataset.buy,scenario.tier);
    assert.equal(el('upgrade').hidden,scenario.tier==='plus');
   }
   el('cta-plus').click();
   const ready=!scenario.demo&&scenario.visibility!=='hidden'&&scenario.linked!==false&&scenario.enabled!==false&&scenario.fulfillment!==false&&scenario.relay!==false;
   assert.equal(el('telegramCheckout').hidden,!ready);
   assert.equal(el('telegramCheckout').getAttribute('href'),ready?'https://t.me/dropso_test_bot?start=stars_plus':null);
   if(scenario.tier==='lite')assert.match(el('dialogCopy').textContent,/оставшийся срок LITE не отменяется/);
   if(scenario.tier==='plus')assert.match(el('dialogCopy').textContent,/Продление добавляет 30 дней/);
  }finally{dom.window.close()}
 }
});


test('S2 design preview reads saved catalog, displays actual rewards and uses only TEST claims',async()=>{
 const {s2DesignHtml,s2DesignJs,installS2Design}=await import('../src/s2-design-preview.ts');
 const {JSDOM}=await import('jsdom');
 const routes=[];installS2Design({get:(path,...handlers)=>routes.push({path,handlers})},{},()=>{});
 assert.deepEqual(routes.map(x=>x.path),['/admin/monetization/s2-design','/api/admin/monetization/s2-design-script','/api/admin/monetization/s2-design']);
 assert(routes.every(x=>x.handlers.length===3));
 const rows=Array.from({length:50},(_,i)=>['free','premium'].map(track=>({level:i+1,track,kind:'skin',label:'Saved '+track+' '+(i+1),value:i===49?(track==='free'?550:2527):10,image:'https://example.test/skin.png'}))).flat();
 const catalog={testOnly:true,rows,thresholds:Array.from({length:50},(_,i)=>(i+1)*1000),startsAt:'2026-12-14T21:00:00Z',endsAt:'2027-03-14T21:00:00Z',tier:'plus',prices:{free:499,lite:489,plus:474}};
 const task={label:'Mission',sp:100,target:3,unit:'count'},group={tasks:[task],mask:0,replaced:false};
 const state={testOnly:true,revision:3,day:1,premium:true,progress:{level:1,sp:1325,weekly:2,challenges:0,remainingDaily:90,remainingWeekly:109,remainingChallenges:9},state:{receipts:[],days:{1:group},weeks:{1:{...group,mask:1}},months:[group],metrics:{d1:[{progress:1}],w1:[{progress:3}],m1:[{progress:0}]}}};
 const dom=new JSDOM(s2DesignHtml,{url:'https://dropso.site/admin/monetization/s2-design',runScripts:'outside-only'}),w=dom.window,d=w.document,actions=[];
 try{
  w.setInterval=()=>0;
  w.fetch=async(url,options)=>{
   if(url==='/api/admin/monetization/s2-design')return {ok:true,json:async()=>catalog};
   assert.equal(url,'/api/admin/monetization/s2-real');
   const action=JSON.parse(options.body);actions.push(action);
   if(action.action==='claim')state.state.receipts.push({level:action.level,track:action.track});
   return {ok:true,json:async()=>state};
  };
  const flush=()=>new Promise(resolve=>setImmediate(resolve));w.eval(s2DesignJs);await flush();
  assert.equal(d.querySelectorAll('#levels .level').length,50);
  assert.equal(d.querySelectorAll('#levels .reward').length,100);
  assert.match(d.querySelector('#heroCta').textContent,/474/);
  assert.equal(d.querySelector('#heroArt img').getAttribute('src'),'https://example.test/skin.png');
  assert.match(d.querySelector('#final').textContent,/Saved premium 50/);
  assert(d.querySelector('[data-level="1"] .premium button').disabled);
  d.querySelector('#sync').click();await flush();
  assert.equal(d.querySelector('.level.current').dataset.level,'1');
  d.querySelector('[data-group="weekly"]').click();assert.equal(d.querySelectorAll('.task.done').length,1);
  d.querySelector('[data-level="1"] .premium button').click();await flush();
  assert.deepEqual(actions.at(-1),{action:'claim',track:'premium',level:1,revision:3});
  assert(d.querySelector('[data-level="1"] .premium.claimed'));
  assert(d.querySelector('[data-level="2"] .premium button').disabled);
 }finally{dom.window.close()}
});


test('launch readiness is admin-only, read-only and never declares manual approval complete',async()=>{
 const {readinessHtml,readinessJs,installMonetizationReadiness}=await import('../src/monetization-readiness.ts');
 const {JSDOM}=await import('jsdom');
 const routes=[],admin=()=>{};installMonetizationReadiness({get:(path,...handlers)=>routes.push({path,handlers})},admin);
 assert.equal(routes.length,2);assert(routes.every(x=>x.handlers[1]===admin));
 const dom=new JSDOM(readinessHtml,{url:'https://dropso.site/admin/monetization/readiness',runScripts:'outside-only'}),w=dom.window,d=w.document;
 const slots=Array.from({length:100},(_,i)=>({level:Math.floor(i/2)+1,track:i%2?'premium':'free',kind:i<42||i>=98?'skin':'coins'}));
 const saved=slots.filter(x=>x.kind==='skin').map(x=>({...x,name:'skin',price:x.level===50?(x.track==='free'?550:2527):10}));
 const values={'/api/admin/monetization/draft':{config:{lite:{stars:249,visibility:'hidden'},plus:{stars:399,visibility:'hidden'},battlePass:{stars:499,visibility:'hidden'}}},'/api/admin/monetization/stars':{relayConfigured:true,linked:true,control:{support_url:'https://t.me/dropso_cs2'},entitlements:{tier:'free'}},'/api/admin/monetization/s2-setup':{start:'2026-12-15',slots,saved,enabled:false}};
 try{
  w.fetch=async(url,options)=>{assert(!options.method||options.method==='GET');assert(url in values);return {ok:true,json:async()=>values[url]}};
  w.eval(readinessJs);await new Promise(resolve=>setImmediate(resolve));
  assert.match(d.getElementById('summary').textContent,/10 из 13/);
  assert.equal(d.querySelectorAll('#manual .ok').length,0);
  values['/api/admin/monetization/draft'].config.plus.visibility='admin_test';
  d.getElementById('refresh').click();await new Promise(resolve=>setImmediate(resolve));
  assert.match(d.getElementById('summary').textContent,/9 из 13/);
 }finally{dom.window.close()}
});

test('welcome coins cover first LITE, PLUS upgrade, renewals and refund reconciliation',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create table rewards_users(id uuid primary key default gen_random_uuid(),twitch_user_id text,banned boolean default false);
  create table rewards_admins(twitch_user_id text);
  create table rewards_bonus_telegram_links(user_id uuid,telegram_id text);
  create table rewards_monetization_draft(id boolean,config jsonb);
  create table rewards_coin_transactions(user_id uuid,amount integer,transaction_type text,note text);
  insert into rewards_users(twitch_user_id) values('admin'),('player');
  insert into rewards_admins values('admin');
  insert into rewards_bonus_telegram_links select id,case twitch_user_id when 'admin' then '123' else '456' end from rewards_users;
  insert into rewards_monetization_draft values(true,'{"lite":{"stars":249,"visibility":"admin_test"},"plus":{"stars":399,"visibility":"admin_test"}}');
  grant select,update on rewards_users to service_role;grant select on rewards_admins,rewards_bonus_telegram_links,rewards_monetization_draft to service_role;
  grant select,insert on rewards_coin_transactions to service_role;`);
  for(const m of ['20261126180000_stars_pilot.sql','20261126190000_stars_entitlements.sql','20261128010000_membership_player_checkout.sql','20261128030000_membership_welcome_coins.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+m,import.meta.url),'utf8'));
  await db.exec("update rewards_stars_pilot_control set enabled=true,fulfillment_ready=true,support_url='https://example.test/support';set role service_role");
  const action=async(who,a,b)=>(await db.query('select rewards_stars_pilot_action($1,$2,$3) r',[who,a,b])).rows[0].r;
  const total=async(actor='player')=>Number((await db.query('select coalesce(sum(t.amount),0) n from rewards_coin_transactions t join rewards_users u on u.id=t.user_id where u.twitch_user_id=$1',[actor])).rows[0].n);
  const pay=async(product,who='456')=>{const o=await action(who,'create',{product,requestId:randomUUID()});const proof={orderId:o.id,stars:o.stars,currency:'XTR'};await action(who,'precheckout',{...proof,precheckoutId:o.id});const receipt={...proof,chargeId:o.id};await action(who,'receipt',receipt);await action(who,'receipt',receipt);return receipt};
  await assert.rejects(pay('lite'),/product_not_in_test/);
  await pay('lite','123');assert.equal(await total('admin'),0);
  await db.exec("reset role;update rewards_monetization_draft set config=jsonb_set(jsonb_set(config,'{lite,visibility}',to_jsonb('players'::text)),'{plus,visibility}',to_jsonb('players'::text));set role service_role");
  const lite=await pay('lite');assert.equal(await total(),50);
  const renewal=await pay('lite');assert.equal(await total(),50);
  const plus=await pay('plus');assert.equal(await total(),100);
  await action('456','refund',plus);await action('456','refund',plus);assert.equal(await total(),50);
  await action('456','refund',lite);assert.equal(await total(),50);
  await action('456','refund',renewal);assert.equal(await total(),0);
  const directPlus=await pay('plus');assert.equal(await total(),100);
  await action('456','refund',directPlus);assert.equal(await total(),0);
 }finally{await db.close()}
});
