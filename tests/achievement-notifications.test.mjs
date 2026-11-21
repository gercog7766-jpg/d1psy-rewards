import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import express from 'express';
import {achievementMedals} from '../src/achievement-medals.ts';
import {installActivityFeed} from '../src/activity-feed.ts';
import {liveBossPage} from '../src/live-boss.ts';
import {profileHtml,usersJs} from '../src/users-ui.ts';
const id='12345678-1234-1234-1234-123456789abc';
test('achievement notification migration preserves progress and records unique ranks',async()=>{
 const db=new PGlite();
 try{await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table rewards_users(id uuid primary key);
 create table rewards_live_achievement_progress(user_id uuid primary key references rewards_users(id),messages bigint not null default 0,seconds bigint not null default 0,bosses bigint not null default 0);
 insert into rewards_users values('${id}');insert into rewards_live_achievement_progress values('${id}',500,0,0)`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261121170000_achievement_notifications.sql',import.meta.url),'utf8'));
 assert.deepEqual((await db.query('select category,tier from rewards_achievement_notifications')).rows,[{category:'messages',tier:2}]);
 await db.exec('update rewards_live_achievement_progress set messages=2000,seconds=18000,bosses=1');
 await db.exec('update rewards_live_achievement_progress set messages=2000,seconds=18000,bosses=1');
 assert.deepEqual((await db.query('select category,tier from rewards_achievement_notifications order by category,tier')).rows,[{category:'bosses',tier:1},{category:'messages',tier:2},{category:'messages',tier:3},{category:'seconds',tier:1}]);
 await db.exec('set role anon');await assert.rejects(db.query('select * from rewards_achievement_notifications'),/permission denied/);await db.exec('reset role');
 }finally{await db.close()}
});
test('highest badge uses common profile block and descriptive tooltip; boss page has none',async()=>{
 const medals=achievementMedals({messages:2000,seconds:180000,bosses:5});
 assert.equal(medals.length,3);assert.equal(medals[0].title,'CHAT MASTER · Золото');assert.match(medals[0].description,/2\s000 сообщений/);assert.equal(medals[0].image,'/live-boss/746.webp');assert.equal(medals[1].title,'STREAM VETERAN · Золото');assert.match(medals[2].description,/150 HP/);
 assert(!liveBossPage('player').includes('id="medals"'));
 const dom=new JSDOM(profileHtml,{url:'https://dropso.test/users/alpha',runScripts:'outside-only'}),w=dom.window;
 try{w.fetch=async()=>({ok:true,json:async()=>({name:'Alpha',login:'alpha',isSelf:false,inventoryHidden:true,achievementMedals:medals})});w.eval(usersJs);
 for(let i=0;i<50&&!w.document.querySelector('#profileMedals .major-profile-medal');i++)await new Promise(r=>setTimeout(r,5));
 const items=[...w.document.querySelectorAll('#profileMedals .major-profile-medal')];assert.equal(items.length,3);assert.equal(items[0].title,medals[0].description);assert(!w.document.getElementById('profileAchievements').hidden);
 }finally{w.close()}
});
test('activity endpoint and toast use actual earned notification and acknowledge user-scoped IDs',async()=>{
 const app=express(),writes=[],row={id,category:'messages',tier:1,earned_at:new Date().toISOString()};
 const db={from(table){let actor,updated;const q={select(){return q},eq(k,v){if(k==='user_id')actor=v;return q},is(){return q},order(){return q},limit(){return q},in(k,v){writes.push({actor,ids:v});return q},update(v){updated=v;return q},maybeSingle(){return Promise.resolve({data:{id:'account-1',banned:false,twitch_login:'alpha'},error:null})},then(resolve,reject){return Promise.resolve({data:updated?null:[row],error:null}).then(resolve,reject)}};return q},rpc(){return Promise.resolve({data:[],error:null})}};
 const auth=(q,r,n)=>{r.locals.session={twitchUserId:'11'};n()};app.use(express.json());installActivityFeed(app,db,auth);
 const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
 const dom=new JSDOM('<a id="messagesTopLink"><span id="messagesUnreadDot"></span></a>',{url:base,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 try{const feed=await(await fetch(base+'/api/me/activity')).json();assert.equal(feed[0].kind,'achievement');assert.equal(feed[0].href,'/users/alpha');
 w.fetch=(path,opts)=>path==='/api/me/social/summary'?Promise.resolve({ok:true,json:async()=>({unread:0})}):fetch(base+path,opts);w.eval(await(await fetch(base+'/activity.js')).text());
 for(let i=0;i<100&&(!writes.length||!w.document.querySelector('.achievement-toast'));i++)await new Promise(r=>setTimeout(r,5));
 assert.match(w.document.querySelector('.achievement-toast').textContent,/Вы получили достижение/);assert.deepEqual(writes,[{actor:'account-1',ids:[id]}]);
 }finally{w.close();await new Promise(r=>server.close(r))}
});
