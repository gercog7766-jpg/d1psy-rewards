import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('live economy carries minutes and messages, deduplicates channels, preserves streaks and checks private access',async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table rewards_users(id uuid primary key default gen_random_uuid(),twitch_user_id text unique,banned boolean default false,participation_restricted boolean default false,xp_total int default 0);
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
 await db.exec('reset role;set role anon');await assert.rejects(stats(),/permission denied/);
 }finally{await db.close()}});

test('live banner only promotes active events and statistics are private and period-aware',async()=>{
 const {default:express}=await import('express'),{JSDOM}=await import('jsdom'),{installLiveEconomy}=await import('../src/live-economy.ts');const calls=[];
 const db={rpc:async(name,args)=>{calls.push({name,args});return {data:name.endsWith('events')?[{login:'partner',giveaway:true,drop:false,boss:false}]:{totals:{seconds:600,messages:25,timeCoins:5,chatCoins:2,streakCoins:0},timeProgress:600,messageProgress:25,streak:2,bestStreak:2,channels:[{login:'partner',seconds:600,messages:25,timeCoins:5,chatCoins:2,streakCoins:0}]}}}};
 const app=express(),auth=(req,res,next)=>{if(req.get('x-test-user')!=='33')return res.sendStatus(401);res.locals.session={twitchUserId:'33'};next()};installLiveEconomy(app,db,auth,(_q,r)=>r.sendStatus(403));app.get('/statistics',auth,(_q,r)=>r.send('<html><head></head><body><main>Stats</main></body></html>'));app.get('/games',(_q,r)=>r.send('<html><head></head><body><main>Games</main></body></html>'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let dom;try{const base='http://127.0.0.1:'+server.address().port;assert.equal((await fetch(base+'/api/me/live-economy')).status,401);assert.equal((await fetch(base+'/api/admin/live-economy',{headers:{'x-test-user':'33'}})).status,403);assert.equal((await fetch(base+'/api/me/live-economy?period=bad',{headers:{'x-test-user':'33'}})).status,400);const html=await(await fetch(base+'/statistics',{headers:{'x-test-user':'33'}})).text();assert((await(await fetch(base+'/games')).text()).includes('dropsoLiveEvents'));dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:base+'/statistics'});const w=dom.window;w.fetch=(p)=>fetch(base+p,{headers:{'x-test-user':'33'}});w.eval(await(await fetch(base+'/live-economy.js')).text());for(let i=0;i<100&&!w.document.querySelector('#liveCenterRows tr');i++)await new Promise(r=>setTimeout(r,10));assert.equal(w.document.querySelector('#dropsoLiveEvents a').href,'https://www.twitch.tv/partner');assert(w.document.querySelector('#liveCenterProgress').textContent.includes('25/100'));assert.equal(w.document.querySelector('main').firstElementChild.id,'dropsoLiveEvents');const period=w.document.getElementById('liveCenterPeriod');period.value='week';period.dispatchEvent(new w.Event('change'));for(let i=0;i<100&&!calls.some(c=>c.args?.p_period==='week');i++)await new Promise(r=>setTimeout(r,10));assert(calls.some(c=>c.args?.p_period==='week'&&c.args.p_actor==='33'&&!c.args.p_admin));}finally{dom?.window.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
});
