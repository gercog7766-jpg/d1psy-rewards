import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('live economy carries minutes and messages, deduplicates channels, preserves streaks and checks private access',async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table rewards_users(id uuid primary key default gen_random_uuid(),twitch_user_id text unique,twitch_login text,banned boolean default false,participation_restricted boolean default false,xp_total int default 0);
 create table rewards_streamers(id uuid default gen_random_uuid(),twitch_broadcaster_id text,twitch_login text,is_primary boolean,enabled boolean);
 create table rewards_streamer_live_profiles(broadcaster_id text primary key,login text,status text);
 create table rewards_admins(twitch_user_id text primary key);create table rewards_clan_chat_channels(broadcaster text primary key,authorized_at timestamptz,last_error text);
 create table rewards_coin_transactions(user_id uuid,amount int,transaction_type text,note text);
 create table rewards_profile_style(user_id uuid primary key,title text);
 create table rewards_xp_history(id uuid primary key default gen_random_uuid(),user_id uuid,amount int,reason text,source_type text,source_id text,unique(user_id,source_type,source_id));
 create table rewards_streamer_live_rounds(broadcaster_id text,status text);create table rewards_rounds(streamer_id uuid,status text);
 create table rewards_connect_settings(broadcaster text,enabled boolean);create table rewards_connect_sessions(broadcaster text,ended_at timestamptz,last_seen timestamptz);create table rewards_boss_runs(status text,hidden boolean);
 insert into rewards_users(twitch_user_id) values('33'),('11'),('44');insert into rewards_admins values('11');insert into rewards_streamers(twitch_broadcaster_id,twitch_login,is_primary,enabled) values('11','owner',true,true);
 insert into rewards_streamer_live_profiles values('22','partner','approved'),('99','unapproved','pending');insert into rewards_clan_chat_channels values('11',now(),null),('22',now(),null);
 grant select,insert,update,delete on all tables in schema public to service_role;`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261121100000_live_boost.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261123110000_live_economy_rewards.sql',import.meta.url),'utf8'));
 const u=(await db.query("select id from rewards_users where twitch_user_id='33'")).rows[0].id;
 const day=(await db.query("select (now() at time zone 'Europe/Moscow')::date::text d")).rows[0].d;
 await db.exec('set role service_role');
 const sample=async(channels)=>(await db.query('select rewards_live_economy_sample(clock_timestamp(),$1)',[JSON.stringify(channels)])).rows;
 const channels=[{broadcaster:'11',live:true,viewers:['33','33']},{broadcaster:'22',live:true,viewers:['33']},{broadcaster:'99',live:true,viewers:['33']}];
 await sample(channels);
 const shift=()=>db.exec("update rewards_live_economy_clock set observed_at=clock_timestamp()-interval '5 minutes';update rewards_live_economy_presence set observed_at=(select observed_at from rewards_live_economy_clock)");
 await shift();await sample(channels);const stats=async(actor='33',admin=false)=>(await db.query('select rewards_live_economy_stats($1,$2,$3) s',[actor,'all',admin])).rows[0].s;
 assert.equal((await stats()).totals.seconds,300);assert.equal((await stats()).channels.length,1);
 const credit=(d,s,m=0,c='22')=>db.query('select rewards_live_economy_credit($1,$2,$3,$4,$5)',[u,d,c,s,m]);
 for(let i=0;i<10;i++)await credit(day,300);assert.equal((await stats()).timeProgress,3300);await credit(day,300);assert.equal((await stats()).totals.timeCoins,5);assert.equal((await stats()).streak,1);
 for(let i=0;i<100;i++)await db.query("select rewards_live_economy_message('22','33',$1,clock_timestamp())",['message-'+i]);await db.query("select rewards_live_economy_message('22','33','message-0',clock_timestamp())");assert.equal((await stats()).totals.chatCoins,2);assert.equal((await stats()).totals.messages,100);
 await db.query("select rewards_live_economy_message('99','33','ignored',clock_timestamp())");assert.equal((await stats()).totals.messages,100);
 await db.query("insert into rewards_xp_history(user_id,amount,reason,source_type,source_id) values($1,20,'test','game','1')",[u]);assert.equal((await db.query("select amount from rewards_xp_history where source_type='live_boost'")).rows[0].amount,5);
 for(const offset of [2,3]){const d=(await db.query('select ($1::date+$2::int)::text d',[day,offset])).rows[0].d;for(let i=0;i<12;i++)await credit(d,300)}assert.equal((await stats()).streak,3);assert.equal((await stats()).totals.streakCoins,5);
 await assert.rejects(stats('33',true),/admin_required/);assert.equal((await stats('11',true)).totals.timeCoins,15);
 await db.exec('reset role');
 await db.exec(`create table rewards_streamer_live_ledger(broadcaster_id text,amount bigint,kind text,request_id uuid,actor text,created_at timestamptz default clock_timestamp(),unique(broadcaster_id,request_id,kind));grant select,insert on rewards_streamer_live_ledger to service_role;create function rewards_crypto_index(n int) returns int language sql as 'select case when n=100 then 10 else 5 end';grant execute on function rewards_crypto_index(int) to service_role;insert into rewards_streamer_live_ledger values('22',1000,'topup',gen_random_uuid(),'11');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261124160000_partner_live_budget.sql',import.meta.url),'utf8'));
 await db.exec('set role service_role');
 const before=(await stats()).totals.seconds;await credit(day,300);assert.equal((await stats()).totals.seconds,before);
 await db.query("select rewards_partner_live_settings_api('22',true)");
 for(let i=0;i<12;i++)await credit(day,300);assert.equal((await stats()).totals.seconds,before+3600);
 const balance=async()=>Number((await db.query("select sum(amount) as n from rewards_streamer_live_ledger where broadcaster_id='22'")).rows[0].n);
 assert.equal(await balance(),995);
 const run=crypto.randomUUID();await assert.rejects(db.query("select rewards_partner_boss_control('22','start',$1,100,1000)",[run]),/insufficient_budget/);
 await db.query("select rewards_partner_boss_control('22','start',$1,100,500)",[run]);await db.query("select rewards_partner_boss_control('22','start',$1,100,500)",[run]);assert.equal(await balance(),495);
 await db.query("select rewards_partner_boss_control('22','pause',$1)",[run]);await assert.rejects(db.query("select rewards_partner_boss_attack('33',$1,gen_random_uuid())",[run]),/boss_inactive/);
 await db.query("select rewards_partner_boss_control('22','resume',$1)",[run]);await db.query("select rewards_partner_boss_control('22','cancel',$1)",[run]);assert.equal(await balance(),995);
 const paidRun=crypto.randomUUID();await db.query("select rewards_partner_boss_control('22','start',$1,100,500)",[paidRun]);
 await db.query("insert into rewards_live_economy_presence(user_id,broadcaster,observed_at) values($1,'22',clock_timestamp()) on conflict(user_id,broadcaster) do update set observed_at=excluded.observed_at",[u]);
 await db.exec("update rewards_live_economy_channels set live=true,observed_at=clock_timestamp() where broadcaster='22'");
 const attack=async(id=crypto.randomUUID())=>(await db.query("select rewards_partner_boss_attack('33',$1,$2) as hit",[paidRun,id])).rows[0].hit;
 const request=crypto.randomUUID();assert.equal((await attack(request)).damage,40);assert.equal((await attack(request)).hp,60);await assert.rejects(attack(),/cooldown/);
 for(let i=0;i<2;i++){await db.query("update rewards_partner_boss_cooldowns set remaining_seconds=0 where run_id=$1",[paidRun]);await attack()}
 assert.equal((await db.query("select status from rewards_partner_boss_runs where id=$1",[paidRun])).rows[0].status,'paid');
 assert.equal((await db.query("select sum(amount)::int as n from rewards_coin_transactions where note=$1",['PARTNER LIVE BOSS · '+paidRun])).rows[0].n,500);assert.equal(await balance(),495);
 const donationRun=crypto.randomUUID();await db.query("select rewards_partner_boss_control('22','start',$1,100,100)",[donationRun]);
 await db.query("select rewards_partner_boss_provider_hit('22','donationalerts','donation-1',null,'viewer',100,1,$1,clock_timestamp())",[u]);
 assert.equal((await db.query("select status from rewards_partner_boss_runs where id=$1",[donationRun])).rows[0].status,'review');
 assert.equal((await db.query("select count(*)::int n from rewards_coin_transactions where note=$1",['PARTNER LIVE BOSS · '+donationRun])).rows[0].n,0);
 const hit=(await db.query("select request_id from rewards_partner_boss_hits where run_id=$1",[donationRun])).rows[0].request_id;
 await assert.rejects(db.query("select rewards_partner_boss_review('99',$1,$2,true)",[donationRun,hit]),/approval_required/);
 await db.query("select rewards_partner_boss_review('22',$1,$2,true)",[donationRun,hit]);assert.equal((await db.query("select status from rewards_partner_boss_runs where id=$1",[donationRun])).rows[0].status,'paid');assert.equal(await balance(),395);
 await db.query("insert into rewards_streamer_live_ledger(broadcaster_id,amount,kind,request_id,actor) values('22',-395,'reserve',gen_random_uuid(),'test')");
 for(let i=0;i<12;i++)await credit(day,300);assert.equal(await balance(),0);
 assert.equal((await db.query("select seconds from rewards_live_economy_wallet_progress where user_id=$1 and broadcaster='22'",[u])).rows[0].seconds,3300);
 await sample(channels);
 assert.equal((await db.query("select count(*)::int n from rewards_live_economy_presence where broadcaster='22'")).rows[0].n,1);
 await db.exec('reset role;set role anon');await assert.rejects(stats(),/permission denied/);
 }finally{await db.close()}});

test('live banner only promotes active events and statistics are private and period-aware',async()=>{
 const {default:express}=await import('express'),{JSDOM}=await import('jsdom'),{installLiveEconomy}=await import('../src/live-economy.ts');const calls=[];
 const db={rpc:async(name,args)=>{calls.push({name,args});return {data:name.endsWith('events')?[{login:'partner',giveaway:true,drop:false,boss:false}]:{totals:{seconds:600,messages:25,timeCoins:5,chatCoins:2,streakCoins:0},timeProgress:600,messageProgress:25,streak:2,bestStreak:2,channels:[{login:'partner',seconds:600,messages:25,timeCoins:5,chatCoins:2,streakCoins:0}]}}}};
 const app=express(),auth=(req,res,next)=>{if(req.get('x-test-user')!=='33')return res.sendStatus(401);res.locals.session={twitchUserId:'33'};next()};installLiveEconomy(app,db,auth,(_q,r)=>r.sendStatus(403));app.get('/statistics',auth,(_q,r)=>r.send('<html><head></head><body><main>Stats</main></body></html>'));app.get('/games',(_q,r)=>r.send('<html><head></head><body><main>Games</main></body></html>'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let dom;try{const base='http://127.0.0.1:'+server.address().port;assert.equal((await fetch(base+'/api/me/live-economy')).status,401);assert.equal((await fetch(base+'/api/admin/live-economy',{headers:{'x-test-user':'33'}})).status,403);assert.equal((await fetch(base+'/api/me/live-economy?period=bad',{headers:{'x-test-user':'33'}})).status,400);const html=await(await fetch(base+'/statistics',{headers:{'x-test-user':'33'}})).text();assert((await(await fetch(base+'/games')).text()).includes('dropsoLiveEvents'));dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:base+'/statistics'});const w=dom.window;w.fetch=(p)=>fetch(base+p,{headers:{'x-test-user':'33'}});w.eval(await(await fetch(base+'/live-economy.js')).text());for(let i=0;i<100&&!w.document.querySelector('#liveCenterRows tr');i++)await new Promise(r=>setTimeout(r,10));assert.equal(w.document.querySelector('#dropsoLiveEvents a').href,'https://www.twitch.tv/partner');assert(w.document.querySelector('#liveCenterProgress').textContent.includes('25/100'));assert.equal(w.document.querySelector('main').firstElementChild.id,'dropsoLiveEvents');const period=w.document.getElementById('liveCenterPeriod');period.value='week';period.dispatchEvent(new w.Event('change'));for(let i=0;i<100&&!calls.some(c=>c.args?.p_period==='week');i++)await new Promise(r=>setTimeout(r,10));assert(calls.some(c=>c.args?.p_period==='week'&&c.args.p_actor==='33'&&!c.args.p_admin));}finally{dom?.window.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
});

test('partner raid UI uses the signed actor for attacks and leaves the main boss page accessible',async()=>{
 const {default:express}=await import('express'),{JSDOM}=await import('jsdom'),{installPartnerLive}=await import('../src/partner-live.ts');
 const calls=[],run=crypto.randomUUID();const raid={id:run,login:'partner',kind:'dropsy',hp:100,max_hp:100,coins:50,status:'active',participants:1,cooldown:0,present:true,leaders:[]};
 const db={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='rewards_partner_boss_list'?[raid]:{damage:40},error:null}},from(){return{select(){return this},eq(){return this},single(){return Promise.resolve({data:{id:run},error:null})}}}};
 const app=express();app.use(express.json());const auth=(_q,r,n)=>{r.locals.session={twitchUserId:'33'};n()};installPartnerLive(app,db,auth,'http://test');app.get('/bosses',(_q,r)=>r.send('<html><body><main>Основной босс</main></body></html>'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let dom;
 try{const base='http://127.0.0.1:'+server.address().port;const main=await(await fetch(base+'/bosses')).text();assert.match(main,/Основной босс/);assert.match(main,/partnerRaidDirectory/);
  const html=await(await fetch(base+'/bosses/partners')).text();dom=new JSDOM(html,{runScripts:'outside-only',url:base+'/bosses/partners'});const w=dom.window;w.fetch=(path,options)=>fetch(base+path,options);w.eval(await(await fetch(base+'/partner-live.js')).text());
  for(let i=0;i<100&&!w.document.querySelector('#raids button');i++)await new Promise(r=>setTimeout(r,10));const attack=w.document.querySelector('#raids button');assert.equal(attack.textContent,'Атаковать');assert.equal(attack.disabled,false);attack.click();for(let i=0;i<100&&w.document.querySelector('#raids button')===attack;i++)await new Promise(r=>setTimeout(r,10));assert.equal(calls.find(c=>c.name==='rewards_partner_boss_attack').args.p_actor,'33');assert.match(w.document.getElementById('status').textContent,/40/);
 }finally{dom?.window.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
});

test('partner dashboard shows wallet, provider cards, boss preview and disables an unaffordable launch',async()=>{
 const {default:express}=await import('express'),{JSDOM}=await import('jsdom'),{installPartnerLive}=await import('../src/partner-live.ts');
 const db={rpc:async(name)=>({data:name==='rewards_partner_boss_list'?[]:{balance:100,bossReserved:0,authorized:true,rewardsEnabled:false,history:[]},error:null}),from(){return{select(){return this},eq(){return this},single(){return Promise.resolve({data:{login:'partner'},error:null})}}}};
 const app=express();const auth=(_q,r,n)=>{r.locals.session={twitchUserId:'33'};n()};installPartnerLive(app,db,auth,'http://test');app.get('/api/partner-live/providers',(_q,r)=>r.json({twitch:'connected',donationalerts:'not_connected',ihaq:'not_connected'}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let dom;
 try{const base='http://127.0.0.1:'+server.address().port;dom=new JSDOM(await(await fetch(base+'/streamer/live')).text(),{runScripts:'outside-only',url:base+'/streamer/live'});const w=dom.window;w.fetch=(path,options)=>fetch(base+path,options);w.eval(await(await fetch(base+'/partner-live.js')).text());const d=w.document;
  for(let i=0;i<100&&(d.getElementById('settings').hidden||d.getElementById('twitchProvider').dataset.state!=='connected');i++)await new Promise(r=>setTimeout(r,10));assert.equal(d.getElementById('balanceValue').textContent,'100');assert.equal(d.getElementById('start').disabled,true);assert.equal(d.getElementById('twitchProvider').dataset.state,'connected');d.getElementById('coins').value='100';d.getElementById('coins').dispatchEvent(new w.Event('input'));assert.equal(d.getElementById('start').disabled,false);d.getElementById('kind').value='titan';d.getElementById('kind').dispatchEvent(new w.Event('change'));assert.match(d.getElementById('bossPreview').src,/758.webp$/);assert.equal(d.getElementById('bossName').textContent,'ABYSS TITAN');
 }finally{dom?.window.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
});
