import {waitForTestServer,stopTestServer} from './fixtures/test-server-ready.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {JSDOM} from 'jsdom';
import {bonusesHtml,bonusesJs} from '../src/bonuses-ui.ts';
const migration=await readFile(new URL('../supabase/migrations/20261118130000_bonus_center.sql',import.meta.url),'utf8');
test('Telegram relay atomically awards 10 coins only once and rejects reused identities or expired links',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create table rewards_users(id uuid primary key default gen_random_uuid(),twitch_user_id text,banned boolean default false,participation_restricted boolean default false);
  create table rewards_coin_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,amount integer,transaction_type text,note text);
  create table rewards_bonus_telegram_links(user_id uuid primary key,token_hash text unique,expires_at timestamptz,telegram_id text unique);
  create table rewards_bonus_telegram_claims(user_id uuid primary key,telegram_id text unique,transaction_id uuid unique);
  insert into rewards_users(twitch_user_id) values('one'),('two'),('three');
  insert into rewards_bonus_telegram_links select id,repeat(case twitch_user_id when 'one' then 'a' when 'two' then 'b' else 'c' end,64),now()+case when twitch_user_id='three' then interval '-1 minute' else interval '10 minutes' end,null from rewards_users;
  grant all on all tables in schema public to service_role;`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261119131000_telegram_bonus_relay.sql',import.meta.url),'utf8'));
  const claim=async(hash,id)=>(await db.query('select rewards_bonus_telegram_relay_claim($1,$2) result',[hash,id])).rows[0].result;
  await db.exec('set role service_role');const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64);
  assert.equal((await claim(a,'123')).amount,10);assert.equal((await claim(a,'123')).claimed,true);
  await assert.rejects(claim(b,'123'),/telegram_already_used/);await assert.rejects(claim(c,'456'),/link_expired/);
  assert.equal((await db.query('select sum(amount)::int total from rewards_coin_transactions')).rows[0].total,10);
  await db.exec('reset role;set role anon');await assert.rejects(claim(b,'456'),/permission denied/);
 }finally{await db.close()}
});
test('Telegram relay only forwards verified channel membership and refuses unrelated webhook replacement',async()=>{
 const {createRelay}=await import('../scripts/telegram-relay.mjs');const calls=[];let subscribed=false;const nonce='a'.repeat(32),relaySecret='b'.repeat(40),webhookSecret='c'.repeat(40);
 const relay=createRelay({token:'12345:test',webhookSecret,relaySecret,webhookUrl:'https://dropso-telegram.onrender.com/telegram-webhook',log:{info(){},warn(){}},fetcher:async(url,o)=>{const body=o.body?JSON.parse(o.body):null;calls.push({url,body,headers:o.headers});if(url.endsWith('getWebhookInfo'))return Response.json({ok:true,result:{url:'https://unrelated.example/webhook'}});if(url.endsWith('getChatMember'))return Response.json({ok:true,result:{status:subscribed?'member':'left'}});if(url.endsWith('/relay'))return Response.json({ok:true,claimed:true,amount:10});return Response.json({ok:true,result:true})}});
 await relay.setup();assert(!calls.some(c=>c.url.endsWith('setWebhook')));
 const update={message:{chat:{id:123,type:'private'},from:{id:123,is_bot:false},text:'/start '+nonce}};
 await relay.process(update);assert(!calls.some(c=>c.url.endsWith('/relay')));assert(calls.at(-1).body.reply_markup.inline_keyboard[1][0].callback_data==='check:'+nonce);
 subscribed=true;await relay.process({callback_query:{id:'1',from:{id:123},message:{chat:{id:123,type:'private'}},data:'check:'+nonce}});
 const push=calls.find(c=>c.url.endsWith('/relay'));assert.equal(push.body.telegramId,'123');assert.match(push.body.tokenHash,/^[a-f0-9]{64}$/);assert.equal(push.headers['X-Dropso-Relay-Secret'],relaySecret);
 assert(!JSON.stringify(push.body).includes(nonce));
});
test('Dropso relay endpoint authenticates service only, accepts exact signed-in link hash and never calls Telegram directly',async()=>{
 const {default:express}=await import('express'),{installBonuses}=await import('../src/bonuses.ts');
 const keys=['BONUS_TELEGRAM_BOT_USERNAME','BONUS_TELEGRAM_RELAY_SECRET'],old=keys.map(k=>process.env[k]);process.env[keys[0]]='dropso_test_bot';process.env[keys[1]]='s'.repeat(40);
 const calls=[],app=express();app.use(express.json());const db={rpc:async(name,body)=>{calls.push({name,body});return {data:name==='rewards_bonus_telegram_relay_claim'?{ok:true,claimed:true,amount:10}:{telegramClaimed:false},error:null}}};
 installBonuses(app,db,(_q,r,n)=>{r.locals.session={twitchUserId:'one'};n()},'https://dropso.test',async()=>{throw Error('direct Telegram access forbidden')});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(path,body,secret)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(secret?{'X-Dropso-Relay-Secret':secret}:{})},body:JSON.stringify(body)});
 try{const b={tokenHash:'a'.repeat(64),telegramId:'123'};assert.equal((await post('/api/bonuses/telegram/relay',b)).status,403);assert.equal(calls.length,0);
 assert.equal((await post('/api/bonuses/telegram/relay',{...b,amount:999},'s'.repeat(40))).status,400);
 assert.equal((await post('/api/bonuses/telegram/relay',b,'s'.repeat(40))).status,200);assert.equal(calls.at(-1).name,'rewards_bonus_telegram_relay_claim');
 assert.equal((await post('/api/me/bonuses/telegram/claim',{})).status,409);assert.equal(calls.at(-1).body.p_action,'state');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i])}
});
test('bonus receipts: every reward, atomic replay, 24h, individual accounts, Telegram and private grants',async()=>{
 const db=new PGlite();const q=async(s,p=[])=>(await db.query(s,p)).rows;
 const call=async(actor,action,body={})=>(await q('select rewards_bonus_center($1,$2,$3::jsonb) r',[actor,action,JSON.stringify(body)]))[0].r;
 try{await db.exec(`
 create role anon;create role authenticated;create role service_role bypassrls;
 create table rewards_users(id uuid primary key default gen_random_uuid(),twitch_user_id text,twitch_login text,banned boolean default false,participation_restricted boolean default false);
 create table rewards_coin_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,amount integer,transaction_type text,note text);
 create table rewards_profile_catalog(id text primary key,name text,kind text,tier text);
 create table rewards_profile_owned(user_id uuid,item_id text,request_id uuid,transaction_id uuid not null,primary key(user_id,item_id));
 create table rewards_vault_seasons(week date primary key,status text,settled_at timestamptz,starts_at timestamptz,ends_at timestamptz,key_cap int);
 create table rewards_vault_wallets(week date,user_id uuid,earned int default 0,balance int default 0,primary key(week,user_id));
 create table rewards_vault_key_ledger(week date,user_id uuid,amount int,kind text constraint rewards_vault_key_ledger_kind_check check(kind in('promo_grant')),event_key text,details jsonb);
 create table rewards_prizes(id uuid primary key default gen_random_uuid(),name text,image_url text,status text,unlimited boolean,draw_weight int,sell_price_coins int);
 create table rewards_shop_items(id uuid,name text,image_url text,status text,stock int);
 create table rewards_shop_item_variants(shop_item_id uuid,available boolean,price_coins int,wear text,variant_kind text);
 create table rewards_wins(id uuid primary key default gen_random_uuid(),user_id uuid,prize_id uuid,won_at timestamptz,delivery_status text,choice_status text,source_type text,item_wear text,item_variant_kind text);
 create table rewards_promo_game_credits(user_id uuid,game text,stake int,balance int,primary key(user_id,game,stake));
 create table rewards_season_progress(user_id uuid,season_id text,sp int,updated_at timestamptz,primary key(user_id,season_id));
 create table xp_receipts(user_id uuid,amount int,reason text,source text,event text unique);
 create function rewards_award_xp(uuid,int,text,text,text) returns void language sql as 'insert into public.xp_receipts values($1,$2,$3,$4,$5)';
 create function rewards_vault_now() returns timestamptz language sql as 'select now()';
 create function rewards_vault_week(timestamptz) returns date language sql as 'select current_date';
 create function rewards_crypto_index(int) returns int language sql as $$select least(coalesce(nullif(current_setting('test.pick',true),''),'0')::int,$1-1)$$;
 insert into rewards_users(twitch_user_id,twitch_login) values('one','one'),('two','two');
 insert into rewards_prizes(name,status,unlimited,sell_price_coins) values('Cheap','available',true,8),('Expensive','available',true,50);
 insert into rewards_profile_catalog values('silver','Silver','frame','simple');
 insert into rewards_vault_seasons values(current_date,'scheduled',null,now()-interval '1 day',now()+interval '1 day',2);
 grant all on all tables in schema public to service_role;
 `);await db.exec(migration);await db.exec('set role service_role');
 const first=randomUUID(),a=await call('one','claim',{requestId:first});assert.equal(a.reward.type,'xp');assert.equal(a.reward.amount,100);
 assert.deepEqual((await call('one','claim',{requestId:first})).reward,a.reward);
 await assert.rejects(call('one','claim',{requestId:randomUUID()}),/bonus_cooldown/);
 assert.equal((await call('two','state')).available,true);assert.equal((await q('select * from xp_receipts')).length,1);
 for(const [pick,type] of [[1,'coins'],[2,'doors'],[3,'skin'],[4,'frame']]){
  await q("update rewards_bonus_claims set claimed_at=now()-interval '25 hours'");await q("select set_config('test.pick',$1,false)",[String(pick)]);
  const r=await call('one','claim',{requestId:randomUUID()});assert.equal(r.reward.type,type);
  if(type==='coins')assert(r.reward.amount>=1&&r.reward.amount<=7);
  if(type==='doors')assert([10,20].includes(r.reward.amount));
  if(type==='skin'){assert.equal(r.reward.amount,8);assert.equal((await q('select source_type from rewards_wins'))[0].source_type,'promo_upgrade')}
 }
 assert.equal((await q('select transaction_id,bonus_claim_id from rewards_profile_owned'))[0].transaction_id,null);
 // With the only ordinary frame already owned, the next eligible option is season SP or a Vault key.
 await q("update rewards_bonus_claims set claimed_at=now()-interval '25 hours'");
 const inSeason=Date.now()>=Date.parse('2026-11-01T21:00:00Z')&&Date.now()<Date.parse('2026-12-12T21:00:00Z');
 if(inSeason){await q("select set_config('test.pick','4',false)");assert.equal((await call('one','claim',{requestId:randomUUID()})).reward.type,'sp');assert.equal((await q('select sp from rewards_season_progress'))[0].sp,150)}
 await q("update rewards_bonus_claims set claimed_at=now()-interval '25 hours'");await q("select set_config('test.pick','99',false)");
 assert.equal((await call('one','claim',{requestId:randomUUID()})).reward.type,'vault_key');assert.equal((await q('select balance from rewards_vault_wallets'))[0].balance,1);
 await q('update rewards_vault_wallets set earned=2,balance=2');await q("update rewards_bonus_claims set claimed_at=now()-interval '25 hours'");assert.notEqual((await call('one','claim',{requestId:randomUUID()})).reward.type,'vault_key');
 // Concurrent clicks with different client IDs still have one successful grant.
 await q("select set_config('test.pick','0',false)");
 const race=await Promise.allSettled([call('two','claim',{requestId:randomUUID()}),call('two','claim',{requestId:randomUUID()})]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 // A downstream award failure rolls back its receipt and leaves the bonus available.
 await q("update rewards_bonus_claims set claimed_at=now()-interval '25 hours'");
 const before=(await q('select count(*)::int n from rewards_bonus_claims'))[0].n;
 await db.exec("reset role;create or replace function rewards_award_xp(uuid,int,text,text,text) returns void language plpgsql as $$begin raise exception 'test_award_failed';end$$;set role service_role");
 await assert.rejects(call('two','claim',{requestId:randomUUID()}),/test_award_failed/);
 assert.equal((await q('select count(*)::int n from rewards_bonus_claims'))[0].n,before);assert.equal((await call('two','state')).available,true);
 const nonce='a'.repeat(64);await call('one','telegram_link',{tokenHash:nonce});await call('','telegram_bind',{tokenHash:nonce,telegramId:'12345'});
 await assert.rejects(call('','telegram_bind',{tokenHash:nonce,telegramId:'12345'}),/link_expired/);
 await assert.rejects(call('one','telegram_claim',{telegramId:'999'}),/telegram_not_linked/);
 await call('one','telegram_claim',{telegramId:'12345'});await call('one','telegram_claim',{telegramId:'12345'});
 assert.equal((await q("select count(*)::int n from rewards_coin_transactions where amount=10"))[0].n,1);
 await call('two','telegram_link',{tokenHash:'b'.repeat(64)});await assert.rejects(call('','telegram_bind',{tokenHash:'b'.repeat(64),telegramId:'12345'}),/unique/);
 await q("update rewards_users set banned=true where twitch_user_id='one'");await assert.rejects(call('one','state'),/user_unavailable/);
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(call('one','state'),/permission denied/);await assert.rejects(q('select * from rewards_bonus_claims'),/permission denied/)}
 }finally{await db.close()}
});
test('bonus page keeps promo and streak APIs, retries the same receipt and renders reward text safely',async()=>{
 const dom=new JSDOM(bonusesHtml,{url:'https://dropso.test/bonuses',runScripts:'outside-only'}),w=dom.window,calls=[];let fail=true;
 w.AbortSignal=AbortSignal;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.fetch=async(url,o)=>{calls.push({url,body:o?.body&&JSON.parse(o.body)});if(url.endsWith('/bonuses/claim')){if(fail){fail=false;throw Error('offline')}return Response.json({nextAt:new Date(Date.now()+86400000).toISOString(),serverNow:new Date().toISOString(),reward:{type:'skin',title:'<img src=x>',description:'Skin',url:'javascript:alert(1)'}})}if(url.includes('daily-bonus'))return Response.json({claimed:false,nextDay:1,nextAmount:1,rewards:[1,3,5,10,15,25,40]});return Response.json({login:'one',serverNow:new Date().toISOString(),available:true,telegramConfigured:false})};
 const until=async fn=>{for(let n=0;n<100&&!fn();n++)await new Promise(r=>setTimeout(r,5));assert(fn())};
 try{new Function(bonusesJs);w.eval(bonusesJs);await until(()=>w.document.querySelectorAll('.dailyDay').length===7);const button=w.document.getElementById('claimRandom');button.click();await until(()=>w.document.getElementById('randomStatus').textContent==='offline');button.click();await until(()=>w.document.getElementById('bonusResult').open);const claims=calls.filter(c=>c.url.endsWith('/bonuses/claim'));assert.equal(claims[0].body.requestId,claims[1].body.requestId);assert.equal(w.document.querySelector('#resultTitle img'),null);assert.equal(w.document.getElementById('resultLink').getAttribute('href'),'/account');assert(w.document.getElementById('claimTelegram').disabled);assert(w.document.getElementById('telegramActions').hidden);const soon=w.document.getElementById('telegramSoon');assert.equal(soon.textContent,'Скоро');assert(soon.disabled);assert.equal(soon.hidden,false);const requests=calls.length;soon.click();assert.equal(calls.length,requests)}finally{w.close()}
});

test('bonus API authenticates, rejects forged rewards and cross-site requests, verifies Telegram membership',async()=>{
 const {default:express}=await import('express'),{default:http}=await import('node:http'),{installBonuses}=await import('../src/bonuses.ts');
 const envKeys=['BONUS_TELEGRAM_BOT_TOKEN','BONUS_TELEGRAM_BOT_USERNAME','BONUS_TELEGRAM_WEBHOOK_SECRET'],old=envKeys.map(k=>process.env[k]);
 process.env.BONUS_TELEGRAM_BOT_TOKEN='test-only';process.env.BONUS_TELEGRAM_BOT_USERNAME='dropso_test_bot';process.env.BONUS_TELEGRAM_WEBHOOK_SECRET='a'.repeat(40);
 let subscribed=false;const calls=[];const db={rpc:async(name,body)=>{calls.push(body);return {data:body.p_action==='state'?{telegramClaimed:false}:body.p_action==='claim'?{ok:true,reward:{type:'xp'}}:{ok:true},error:null}},from(table){return {select(){return this},eq(){return this},single:async()=>({data:{id:'player'},error:null}),maybeSingle:async()=>({data:{telegram_id:'123'},error:null})}}};
 const app=express();app.use(express.json());installBonuses(app,db,(q,r,n)=>{if(!q.get('x-user'))return r.sendStatus(401);r.locals.session={twitchUserId:q.get('x-user')};n()},'https://dropso.test',async(url,o)=>Response.json({ok:true,result:{status:subscribed?'member':'left'}}));
 const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(path,b={},headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','x-user':'one',...headers},body:JSON.stringify(b)});
 try{
 assert.equal((await fetch(base+'/api/me/bonuses')).status,401);
 assert.equal((await post('/api/me/bonuses/claim',{requestId:randomUUID()},{Origin:'https://evil.test'})).status,403);
 assert.equal((await post('/api/me/bonuses/claim',{requestId:randomUUID(),reward:'coins',amount:999})).status,400);assert.equal(calls.length,0);
 assert.equal((await post('/api/me/bonuses/claim',{requestId:randomUUID()})).status,200);assert.equal(calls.at(-1).p_actor,'one');
 const link=await (await post('/api/me/bonuses/telegram/link')).json();assert.match(link.url,/https:\/\/t.me\/dropso_test_bot\?start=[A-Za-z0-9_-]{32}$/);assert.equal(calls.at(-1).p_body.tokenHash.length,64);
 assert.equal((await post('/api/me/bonuses/telegram/claim')).status,409);assert(!calls.some(c=>c.p_action==='telegram_claim'));
 subscribed=true;assert.equal((await post('/api/me/bonuses/telegram/claim')).status,200);assert.deepEqual(calls.at(-1).p_body,{telegramId:'123'});
 assert.equal((await post('/api/me/bonuses/telegram/claim',{telegramId:'999'})).status,400);
 assert.equal((await post('/api/bonuses/telegram/webhook',{message:{text:'/start '+'b'.repeat(32)}})).status,403);
 const webhook={message:{text:'/start '+'b'.repeat(32),chat:{type:'private',id:123},from:{id:123,is_bot:false}}};
 assert.equal((await post('/api/bonuses/telegram/webhook',webhook,{'X-Telegram-Bot-Api-Secret-Token':'a'.repeat(40)})).status,200);assert.equal(calls.at(-1).p_action,'telegram_bind');assert.equal(calls.at(-1).p_body.telegramId,'123');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));envKeys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i])}
});

test('real application moves the streak to bonuses, preserves account navigation and serves authenticated routes',{timeout:90000},async()=>{
 const {default:http}=await import('node:http'),{spawn}=await import('node:child_process'),{createHmac}=await import('node:crypto');
 const mock=http.createServer((q,r)=>{r.setHeader('Content-Type','application/json');if(q.url.includes('/rpc/rewards_bonus_center'))return r.end(JSON.stringify({login:'one',serverNow:new Date().toISOString(),available:true}));r.end('[]')});
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const origin='http://127.0.0.1:'+port,secret='bonus-test';const child=spawn(process.execPath,['--import','tsx','src/server-entry.ts'],{env:{...process.env,PORT:String(port),APP_URL:origin,SUPABASE_URL:'http://127.0.0.1:'+mock.address().port,SUPABASE_SECRET_KEY:'test',SESSION_SECRET:secret,REWARDS_ENGINE_ENABLED:'false',TWITCH_CLIENT_ID:'',TWITCH_CLIENT_SECRET:'',TWITCH_EVENTSUB_SECRET:''},stdio:['ignore','ignore','pipe']});
 const payload=Buffer.from(JSON.stringify({twitchUserId:'one',login:'one',exp:Date.now()+60000})).toString('base64url'),headers={Cookie:'rewards_session='+payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url')};
 try{await waitForTestServer(origin,child);
 const loggedOut=await fetch(origin+'/bonuses',{redirect:'manual'});assert.equal(loggedOut.status,302);assert.equal(loggedOut.headers.get('location'),'/auth/twitch');
 const page=await fetch(origin+'/bonuses',{headers});assert.equal(page.status,200);const html=await page.text();assert(html.includes('id="dailyBonusCard"'));assert(html.includes('id="dropsoSiteSidebar"'));assert(html.includes('id="d1psyFooter"'));assert(html.includes('id="bonusResult"'));
 const account=await(await fetch(origin+'/account',{headers})).text();assert(!account.includes('id="dailyBonusCard"'));assert(account.includes('id="bonusesLink"'));assert(!account.includes('id="promoOpen"'));
 assert.equal((await fetch(origin+'/api/me/bonuses')).status,401);assert.equal((await fetch(origin+'/api/me/bonuses',{headers})).status,200);
 }finally{await stopTestServer(child);mock.closeAllConnections();await new Promise(r=>mock.close(r))}
});
