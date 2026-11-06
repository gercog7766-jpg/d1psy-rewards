import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';
test('PWA: private device sessions, bans, ownership, drop-only jobs, leases, tests and logout cascade',async()=>{
 const db=new PGlite();const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',P='00000000-0000-4000-8000-000000000003',R='00000000-0000-4000-8000-000000000004';const hash='a'.repeat(64),other='b'.repeat(64);
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema vault;create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text);
 create table public.rewards_users(id uuid primary key,twitch_user_id text,twitch_login text,twitch_display_name text,banned boolean default false);
 create table public.rewards_prizes(id uuid primary key,name text);create table public.rewards_wins(id uuid primary key default gen_random_uuid(),user_id uuid,prize_id uuid,round_id uuid,source_type text);
 insert into public.rewards_users values('${A}','one','one','One',false),('${B}','two','two','Two',false);insert into public.rewards_prizes values('${P}','Test skin');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261106030715_pwa_push_and_sessions.sql',import.meta.url),'utf8'));
 await db.query('insert into public.rewards_device_sessions(token_hash,user_id) values($1,$2),($3,$4)',[hash,A,other,B]);
 const rows=async(q,p=[]) => (await db.query(q,p)).rows;
 assert.equal((await rows('select public.rewards_device_resolve($1) s',[hash]))[0].s.login,'one');
 await db.query('update public.rewards_users set banned=true where id=$1',[A]);assert.equal((await rows('select public.rewards_device_resolve($1) s',[hash]))[0].s,null);await db.query('update public.rewards_users set banned=false where id=$1',[A]);
 const subscribe=(u,h,endpoint)=>db.query('select public.rewards_push_subscribe($1,$2,$3,$4,$5)',[u,h,endpoint,'key','auth']);
 await assert.rejects(subscribe(A,other,'https://fcm.googleapis.com/wrong'),/device_required/);
 await subscribe(A,hash,'https://fcm.googleapis.com/a');await subscribe(A,hash,'https://fcm.googleapis.com/a');assert.equal((await rows('select count(*) n from public.rewards_push_subscriptions'))[0].n,1);
 await assert.rejects(subscribe(B,other,'https://fcm.googleapis.com/a'),/subscription_conflict/);
 await subscribe(B,other,'https://fcm.googleapis.com/b');
 await db.query('insert into public.rewards_wins(user_id,prize_id,round_id) values($1,$2,$3)',[A,P,R]);
 await db.query("insert into public.rewards_wins(user_id,prize_id,source_type) values($1,$2,'shop'),($1,$2,'contract')",[A,P]);
 assert.equal((await rows('select count(*) n from public.rewards_push_jobs'))[0].n,1);
 const jobs=await rows('select * from public.rewards_push_claim()');assert.equal(jobs.length,1);assert.equal(jobs[0].attempts,1);assert.equal(jobs[0].payload.title,'Тебе выпал дроп!');assert.equal((await rows('select * from public.rewards_push_claim()')).length,0);
 await db.exec("update public.rewards_push_jobs set lease_until=now()-interval '1 minute'");assert.equal((await rows('select * from public.rewards_push_claim()'))[0].attempts,2);
 await db.query('select public.rewards_push_test($1,$2)',[A,hash]);await assert.rejects(db.query('select public.rewards_push_test($1,$2)',[A,hash]),/test_rate_limit/);
 await db.query('delete from public.rewards_device_sessions where token_hash=$1',[hash]);assert.equal((await rows('select count(*) n from public.rewards_push_jobs'))[0].n,0);assert.equal((await rows('select public.rewards_device_resolve($1) s',[hash]))[0].s,null);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from public.rewards_push_config'),/permission denied/);await assert.rejects(db.query('select public.rewards_push_credentials()'),/permission denied/);await assert.rejects(db.query('select public.rewards_device_resolve($1)',[other]),/permission denied/);await db.exec('reset role')}
 }finally{await db.close()}
});
