import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
const migration=new URL('../supabase/migrations/20261105213416_predict_matches.sql',import.meta.url);

test('BO3 predictions: edits, DB cutoff, independent rewards, ties, atomicity and permissions',async()=>{
 const db=new PGlite();
 const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table public.rewards_users(id uuid primary key);
 create table public.rewards_coin_transactions(id uuid primary key default gen_random_uuid(),user_id uuid references public.rewards_users(id),amount integer not null check(amount<>0),transaction_type text not null check(transaction_type='adjustment'),note text);
 alter table public.rewards_coin_transactions enable row level security;
 grant select,insert on public.rewards_coin_transactions to service_role;`);
 for(let n=1;n<=7;n++)await db.query('insert into public.rewards_users values($1)',[uid(n)]);
 await db.exec(await readFile(migration,'utf8'));
 const {rows:seed}=await db.query('select id,starts_at,roster_a,roster_b from public.rewards_predict_matches order by starts_at');
 assert.equal(seed.length,2);assert.equal(new Date(seed[0].starts_at).toISOString(),'2026-11-06T06:30:00.000Z');assert.equal(new Date(seed[1].starts_at).toISOString(),'2026-11-06T09:30:00.000Z');
 assert.deepEqual(seed[0].roster_a,['HObbit','FL1T','Jame','xiELO','zweih']);assert.deepEqual(seed[1].roster_b,['FalleN','yuurih','YEKINDAR','KSCERATO','molodoy']);
 await db.exec(`insert into public.rewards_predict_matches(id,starts_at,team_a,team_b,logo_a,logo_b,roster_a,roster_b)
 select 'test-match',clock_timestamp()+interval '1 hour',team_a,team_b,logo_a,logo_b,roster_a,roster_b from public.rewards_predict_matches limit 1`);
 async function save(n,winner,score,player,match='test-match'){return (await db.query('select public.rewards_save_prediction($1,$2,$3,$4,$5) as p',[uid(n),match,winner,score,player])).rows[0].p}
 async function settle(winner='a',score='2:0',players=['Jame'],match='test-match'){return (await db.query('select public.rewards_settle_predictions($1,$2,$3,$4) as result',[match,winner,score,players])).rows[0].result}
 await db.exec('set role service_role');
 await save(1,'b','2:1','iM');await save(1,'a','2:0','Jame');
 assert.equal((await db.query('select count(*)::int as n from public.rewards_predictions')).rows[0].n,1);
 await save(2,'a','2:1','Jame');await save(3,'b','2:0','Jame');await save(4,'a','2:0','b1t');await save(5,'a','2:1','b1t');await save(6,'b','2:1','b1t');
 await assert.rejects(save(1,'a','2:2','Jame'),/invalid_prediction/);
 await assert.rejects(save(1,'a','2:0','outsider'),/invalid_prediction/);
 await assert.rejects(save(1,null,'2:0','Jame'),/invalid_prediction/);
 await assert.rejects(save(1,'a','2:0','Jame','missing'),/match_not_found/);
 await assert.rejects(settle(),/match_not_finished/);
 await db.exec("reset role;update public.rewards_predict_matches set starts_at=clock_timestamp()+interval '15 minutes' where id='test-match';set role service_role");
 await assert.rejects(save(1,'b','2:0','iM'),/predictions_closed/);
 assert.equal((await db.query('select winner from public.rewards_predictions where user_id=$1',[uid(1)])).rows[0].winner,'a');
 await db.exec("reset role;update public.rewards_predict_matches set starts_at=clock_timestamp()-interval '1 minute' where id='test-match';set role service_role");
 await assert.rejects(settle('a','2:0',['outsider']),/invalid_result/);
 await db.exec('reset role;revoke insert on public.rewards_coin_transactions from service_role;set role service_role');
 await assert.rejects(settle(),/permission denied/);
 assert.equal((await db.query("select status from public.rewards_predict_matches where id='test-match'")).rows[0].status,'scheduled');
 assert.equal((await db.query('select count(*)::int as n from public.rewards_predictions where settled_at is not null')).rows[0].n,0);
 await db.exec('reset role;grant insert on public.rewards_coin_transactions to service_role;set role service_role');
 const result=await settle();assert.equal(result.coins,30);assert.equal(result.predictions,6);
 const {rows:awards}=await db.query('select user_id,winner_coins,score_coins,player_coins from public.rewards_predictions order by user_id');
 assert.deepEqual(awards.map(x=>[x.winner_coins,x.score_coins,x.player_coins]),[[3,3,4],[3,0,4],[0,0,4],[3,3,0],[3,0,0],[0,0,0]]);
 await Promise.all(Array.from({length:5},()=>settle()));
 assert.equal((await db.query('select count(*)::int as n from public.rewards_coin_transactions')).rows[0].n,5);
 assert.equal((await db.query('select sum(amount)::int as n from public.rewards_coin_transactions')).rows[0].n,30);
 await assert.rejects(settle('b'),/result_already_set/);await assert.rejects(save(1,'b','2:1','iM'),/predictions_closed/);
 // Tied kill leaders: either listed player is a correct prediction.
 await db.exec("reset role;insert into public.rewards_predict_matches(id,starts_at,team_a,team_b,logo_a,logo_b,roster_a,roster_b) select 'tie-match',clock_timestamp()+interval '1 hour',team_a,team_b,logo_a,logo_b,roster_a,roster_b from public.rewards_predict_matches where id='test-match';set role service_role");
 await save(7,'b','2:1','iM','tie-match');
 await db.exec("reset role;update public.rewards_predict_matches set starts_at=clock_timestamp()-interval '1 minute' where id='tie-match';set role service_role");
 assert.equal((await settle('a','2:0',['Jame','iM'],'tie-match')).coins,4);
 for(const role of ['anon','authenticated']){
 await db.exec('reset role;set role '+role);
 await assert.rejects(db.query('select * from public.rewards_predictions'),/permission denied/);
 await assert.rejects(db.query('select * from public.rewards_predict_matches'),/permission denied/);
 await assert.rejects(save(1,'a','2:0','Jame'),/permission denied/);
 await assert.rejects(settle(),/permission denied/);
 }
 }finally{await db.close()}
});
