import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
test('boss lifecycle, capped damage, paused cooldown, donor identity and proportional payout',async()=>{
 const d=new PGlite();
 try{
 await d.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table rewards_users(id uuid primary key default gen_random_uuid(),twitch_user_id text,twitch_login text,xp_total int default 0,updated_at timestamptz,banned boolean default false,participation_restricted boolean default false);
 create table rewards_streamers(twitch_broadcaster_id text,is_primary boolean,enabled boolean);
 create table rewards_coin_transactions(user_id uuid,amount int,transaction_type text,note text);
 create table rewards_xp_history(id uuid primary key default gen_random_uuid(),user_id uuid,amount int,reason text,source_type text,source_id text,unique(user_id,source_type,source_id));
 insert into rewards_streamers values('11',true,true),('22',false,true);
 insert into rewards_users(twitch_user_id,twitch_login) values('33','alpha'),('44','beta');`);
 const fixture=await readFile(new URL('./fixtures/game-bp-existing.sql',import.meta.url),'utf8');
 await d.exec(fixture.slice(0,fixture.indexOf('CREATE OR REPLACE FUNCTION public.rewards_season_add_task_progress')));
 await d.exec(await readFile(new URL('../supabase/migrations/20261121150000_live_boss.sql',import.meta.url),'utf8'));
 const control=(a,b={},actor='11')=>d.query('select rewards_boss_control($1,$2,$3)',[actor,a,b]);
 const hit=(s,e,actor,donor=null,rub=null)=>d.query('select rewards_boss_hit($1,$2,$3,$4,$5)',[s,e,actor,donor,rub]);
 await assert.rejects(control('start',{kind:'dropsy'},'22'),/owner_required/);
 await control('start',{kind:'dropsy'});await hit('free','1','33');await assert.rejects(hit('free','2','33'),/cooldown/);
 await control('pause');await assert.rejects(hit('free','3','44'),/boss_inactive/);await control('resume');await assert.rejects(hit('free','4','33'),/cooldown/);
 await hit('donationalerts','a',null,'ALPHA',100);await hit('donationalerts','a',null,'ALPHA',100);
 await hit('ihaq','b',null,'unrecognized',100);const id=(await d.query("select id from rewards_boss_hits where event_id='b'")).rows[0].id;
 await control('identify',{hitId:id,login:'beta'});await hit('ihaq','c',null,'unknown',10000);
 const b=(await d.query('select hp,status from rewards_boss_runs')).rows[0];assert.deepEqual(b,{hp:0,status:'review'});
 await control('pay');await assert.rejects(control('pay'),/no_boss/);
 const awards=(await d.query('select damage,coins,xp from rewards_boss_awards order by damage desc')).rows;
 assert.deepEqual(awards,[{damage:240,coins:24,xp:120},{damage:200,coins:20,xp:100}]);
 assert.equal((await d.query('select sum(bosses)::int n from rewards_live_achievement_progress')).rows[0].n,2);
 await d.query("select rewards_live_chat_achievement('11','33','m1','hello',now())");
 await d.query("select rewards_live_chat_achievement('11','33','m1','hello',now())");
 await d.query("select rewards_live_chat_achievement('22','33','m2','other',now())");
 assert.equal(Number((await d.query("select messages from rewards_live_achievement_progress p join rewards_users u on p.user_id=u.id where u.twitch_user_id='33'")).rows[0].messages),1);
 }finally{await d.close()}
});
