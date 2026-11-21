import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectChatters,collectLiveChannels} from '../src/clan-chat-presence.ts';
import {installClanChatAuthorization} from '../src/clan-chat-presence.ts';
import express from 'express';
import cookieParser from 'cookie-parser';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {liveBoostMarkup,liveBoostScript} from '../src/live-boost.ts';
import {JSDOM} from 'jsdom';

test('Twitch presence paginates, deduplicates channels, excludes the broadcaster and ignores incomplete pages',async()=>{
 const requests=[],status=[];const fake=async(route)=>{const q=new URL(route,'https://api.twitch.tv/helix/').searchParams,id=q.get('broadcaster_id'),after=q.get('after');requests.push([id,after]);assert.equal(q.get('moderator_id'),id);assert.equal(q.get('first'),'1000');if(id==='11')return after?{data:[{user_id:'22'},{user_id:'33'}]}:{data:[{user_id:'11'},{user_id:'22'}],pagination:{cursor:'page2'}};if(id==='44')return {data:[{user_id:'22'},{user_id:'55'}]};if(id==='66'){if(after)throw Error('authorization_required');return {data:[{user_id:'77'}],pagination:{cursor:'next'}}}throw Error('unavailable')};
 const result=await collectChatters(['11','44','66','invalid'],fake,async(id,error,viewers)=>status.push([id,error,viewers]));assert.deepEqual(result.sort(),['22','33','55']);assert.deepEqual(requests,[['11',null],['11','page2'],['44',null],['66',null],['66','next']]);assert.deepEqual(status,[['11',null,['22','33']],['44',null,['22','55']],['66','authorization_required',undefined]]);
});

test('primary live status is queried even without chat authorization; only authorized live channels are sampled',async()=>{
 const requested=[];const helix=async route=>{const ids=new URL(route,'https://api.twitch.tv/helix/').searchParams.getAll('user_id');requested.push(ids);return {data:[{user_id:'11',type:'live'},{user_id:'22',type:'live'}]}};
 assert.deepEqual(await collectLiveChannels([], '11',helix),{primaryLive:true,authorizedLive:[]});
 assert.deepEqual(await collectLiveChannels(['22'],'11',helix),{primaryLive:true,authorizedLive:['22']});assert.deepEqual(requested,[['11'],['11','22']]);
 assert.deepEqual(await collectLiveChannels([],'11',async()=>({data:[]})),{primaryLive:false,authorizedLive:[]});
 await assert.rejects(collectLiveChannels([],'11',async()=>({error:'bad'})),/streams_unavailable/);
});

test('only approved broadcaster can grant chat-list permission; OAuth state is single-use, bound to signed account and stores no token',async()=>{
 const app=express(),writes=[],originalFetch=globalThis.fetch;app.use(cookieParser());const db={from(table){const q={select(){return this},eq(){return this},maybeSingle(){return Promise.resolve({data:null,error:null})},then(resolve,reject){return Promise.resolve({data:table==='rewards_streamers'?[{twitch_broadcaster_id:'11'}]:table==='rewards_streamer_live_profiles'?[{broadcaster_id:'22'}]:[],error:null}).then(resolve,reject)},upsert(value){writes.push(value);return Promise.resolve({error:null})}};return q}};
 const user=(q,r,n)=>{if(!q.get('x-user'))return r.sendStatus(401);r.locals.session={twitchUserId:q.get('x-user')};n()};installClanChatAuthorization(app,db,user,'http://dropso.test','http://dropso.test/auth/twitch/callback',{clientId:'test',secret:'test'});app.get('/auth/twitch/callback',(_q,r)=>r.send('normal login'));const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;let exchanges=0,identity='11';globalThis.fetch=async(url,opts)=>{if(String(url).startsWith('https://id.twitch.tv/')){exchanges++;return new Response(JSON.stringify({access_token:'temporary-token',scope:['moderator:read:chatters']}),{status:200})}if(String(url).startsWith('https://api.twitch.tv/'))return new Response(JSON.stringify({data:[{id:identity}]}),{status:200});return originalFetch(url,opts)};
 const get=(path,actor,cookie)=>originalFetch(base+path,{redirect:'manual',headers:{...(actor?{'x-user':actor}:{}),...(cookie?{cookie}:{})}});
 const begin=async()=>{const r=await get('/clans/chat-connect/authorize','11');assert.equal(r.status,302);const url=new URL(r.headers.get('location'));assert(url.searchParams.get('scope').includes('moderator:read:chatters'));const state=url.searchParams.get('state'),cookie=r.headers.get('set-cookie').split(';')[0];return {state,cookie}};
 try{assert.equal((await get('/clans/chat-connect','33')).status,403);assert.equal((await get('/clans/chat-connect','11')).status,200);assert.equal((await get('/clans/chat-connect/authorize','33')).status,403);assert.equal(await (await get('/auth/twitch/callback?state=normal')).text(),'normal login');let p=await begin();assert.equal((await get('/auth/twitch/callback?code=x&state='+p.state,'22',p.cookie)).status,400);assert.equal(exchanges,0);p=await begin();identity='22';assert.equal((await get('/auth/twitch/callback?code=x&state='+p.state,'11',p.cookie)).status,403);assert.equal(writes.length,0);p=await begin();identity='11';assert.equal((await get('/auth/twitch/callback?code=x&state='+p.state,'11',p.cookie)).status,302);assert.equal(writes.length,1);assert.equal(writes[0].broadcaster,'11');assert(!JSON.stringify(writes).includes('temporary-token'));assert.equal((await get('/auth/twitch/callback?code=x&state='+p.state,'11',p.cookie)).status,400)}finally{globalThis.fetch=originalFetch;await new Promise(r=>server.close(r))}
});

test('LIVE BOOST only awards ordinary Dropso XP to confirmed primary chat viewers, once and with exact cumulative quarter',async()=>{
 const d=new PGlite();
 try{
 await d.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table rewards_users(id uuid primary key default gen_random_uuid(),twitch_user_id text unique,xp_total int default 0,updated_at timestamptz,banned boolean default false,participation_restricted boolean default false);
 create table rewards_xp_history(id uuid primary key default gen_random_uuid(),user_id uuid,amount int,reason text,source_type text,source_id text,created_at timestamptz default now(),unique(user_id,source_type,source_id));
 create table rewards_streamers(twitch_broadcaster_id text,twitch_login text,is_primary boolean,enabled boolean);
 create table rewards_clan_chat_channels(broadcaster text primary key,authorized_at timestamptz,last_error text);
 insert into rewards_streamers values('11','owner',true,true),('22','partner',false,true);
 insert into rewards_clan_chat_channels values('11',now(),null),('22',now(),null);
 insert into rewards_users(twitch_user_id) values('11'),('33'),('44'),('55');`);
 const fixture=await readFile(new URL('./fixtures/game-bp-existing.sql',import.meta.url),'utf8');await d.exec(fixture.slice(0,fixture.indexOf('CREATE OR REPLACE FUNCTION public.rewards_season_add_task_progress')));
 await d.exec(await readFile(new URL('../supabase/migrations/20261121100000_live_boost.sql',import.meta.url),'utf8'));
 const sample=(id,active,users)=>d.query('select rewards_live_boost_sample($1,clock_timestamp(),$2,$3)',[id,active,users]);
 const status=async actor=>(await d.query('select rewards_live_boost_status($1) data',[actor])).rows[0].data;
 const award=(actor,amount,type,id)=>d.query("select rewards_award_xp(id,$2,'Test',$3,$4) from rewards_users where twitch_user_id=$1",[actor,amount,type,id]);
 const xp=async actor=>(await d.query('select xp_total from rewards_users where twitch_user_id=$1',[actor])).rows[0].xp_total;
 await assert.rejects(sample('22',true,['44']),/primary_required/);
 await sample('11',true,['11','33','33']);assert.equal((await status('33')).eligible,true);assert.equal((await status('44')).eligible,false);assert.equal((await status('11')).eligible,false);
 await award('33',100,'bonus_day','a');await award('33',100,'bonus_day','a');assert.equal(await xp('33'),125);
 await award('33',10,'tic_tac_toe_win','b');await award('33',10,'tic_tac_toe_win','c');assert.equal(await xp('33'),150);
 await award('44',100,'bonus_day','d');assert.equal(await xp('44'),100);
 await award('33',100,'admin_adjustment','e');await award('33',100,'season_reward','f');assert.equal(await xp('33'),350);
 await sample('11',false,[]);assert.equal((await status('33')).live,false);await award('33',100,'bonus_day','g');assert.equal(await xp('33'),450);
 await sample('11',true,['33']);await d.exec("update rewards_live_boost_state set observed_at=now()-interval '7 minutes'");assert.equal((await status('33')).live,false);await award('33',100,'bonus_day','h');assert.equal(await xp('33'),550);
 await sample('11',true,['33']);await d.exec("update rewards_live_boost_state set trial_until=now()-interval '1 minute'");assert.equal((await status('33')).live,false);await award('33',100,'bonus_day','i');assert.equal(await xp('33'),650);
 assert.equal((await d.query("select sum(amount)::int n from rewards_xp_history where source_type='live_boost'")).rows[0].n,30);
 await d.exec('set role anon');await assert.rejects(d.query("select rewards_live_boost_status('33')"),/permission denied/);await d.exec('reset role');
 }finally{await d.close()}
});
test('LIVE BOOST banner shows only when primary chat is active, and distinguishes eligible player',async()=>{
 const dom=new JSDOM('<main><section id="adventAccountHero"></section>'+liveBoostMarkup+'</main>',{runScripts:'outside-only',url:'https://dropso.site/account'}),w=dom.window;
 try{w.fetch=async()=>({ok:true,json:async()=>({live:true,eligible:true,login:'owner'})});w.eval(liveBoostScript);await new Promise(r=>setTimeout(r,30));const b=w.document.getElementById('liveBoostBanner');assert.equal(b.hidden,false);assert.equal(b.dataset.eligible,'true');assert.equal(w.document.getElementById('liveBoostWatch').href,'https://www.twitch.tv/owner');assert.equal(b.nextElementSibling.id,'adventAccountHero')}finally{w.close()}
});
