import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
const migration=await readFile(new URL('../supabase/migrations/20261106135601_live_coin_bets.sql',import.meta.url),'utf8');
test('Live wagers: limits, odds, debit, idempotency, settlement, refund, history and restricted access',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table rewards_users(id uuid primary key,banned boolean default false,participation_restricted boolean default false);create table rewards_coin_transactions(id uuid primary key default gen_random_uuid(),user_id uuid references rewards_users(id),amount integer,transaction_type text,note text);`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261106132609_live_test_markets.sql',import.meta.url),'utf8'));await db.exec(migration);
 const u='11111111-1111-4111-8111-111111111111';let seq=0;const request=()=>`22222222-2222-4222-8222-${String(++seq).padStart(12,'0')}`;
 await db.query('insert into rewards_users(id) values($1)',[u]);await db.query("insert into rewards_coin_transactions(user_id,amount) values($1,1000)",[u]);
 const balance=async()=>Number((await db.query('select sum(amount) n from rewards_coin_transactions where user_id=$1',[u])).rows[0].n);
 const bet=(key,outcome,stake,version,id=request())=>db.query('select rewards_live_place_bet($1,$2,$3,$4,$5,$6) b',[u,key,outcome,stake,version,id]);
 const update=(key,version,enabled,result)=>db.query('select rewards_live_update($1,$2,$3,$4) m',[key,version,enabled,result]);
 await assert.rejects(bet('winner','p1',5,0),/market_closed/);await update('winner',0,true,null);
 for(const stake of [0,4,151])await assert.rejects(bet('winner','p1',stake,1),/invalid_bet/);
 await assert.rejects(bet('winner','yes',5,1),/invalid_bet/);await assert.rejects(bet('winner','p1',5,0),/live_changed/);
 const id=request();const b=(await bet('winner','p1',5,1,id)).rows[0].b;assert.equal(Number(b.odds),1.85);assert.equal(await balance(),995);
 await bet('winner','p1',5,1,id);assert.equal(await balance(),995);await assert.rejects(bet('winner','p2',5,1,id),/request_conflict/);
 await bet('winner','p2',150,1);assert.equal(await balance(),845);
 await update('winner',1,false,'p1');assert.equal(await balance(),854); // round(5*1.85)=9
 let bets=(await db.query('select * from rewards_live_bets order by created_at,id')).rows;assert.equal(bets.find(x=>x.outcome==='p1').payout,9);assert.equal(bets.find(x=>x.outcome==='p2').status,'lost');
 await update('winner',2,false,'p1');assert.equal(await balance(),854);await assert.rejects(update('winner',3,false,'p2'),/result_locked/);
 await update('winner',3,true,null);assert.equal((await db.query("select generation from rewards_live_test_markets where key='winner'")).rows[0].generation,2);
 await bet('winner','p1',150,4);await update('winner',4,false,'void');assert.equal(await balance(),854);
 await update('regulation',0,true,null);await bet('regulation','p2',5,1);await update('regulation',1,false,'draw');assert.equal(await balance(),854);
 await update('grenade',0,true,null);await bet('grenade','yes',150,1);await update('grenade',1,false,'yes');assert.equal(await balance(),3704);
 await update('ace',0,true,null);await db.query('update rewards_users set banned=true where id=$1',[u]);await assert.rejects(bet('ace','yes',5,1),/user_unavailable/);await db.query('update rewards_users set banned=false where id=$1',[u]);
 await db.query('insert into rewards_coin_transactions(user_id,amount) values($1,-3704)',[u]);await assert.rejects(bet('ace','yes',5,1),/insufficient_coins/);
 const state=(await db.query('select rewards_live_user_state($1) s',[u])).rows[0].s;assert.equal(state.bets.length,5);assert.equal(state.balance,0);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from rewards_live_bets'),/permission denied/);await assert.rejects(db.query('select rewards_live_user_state($1)',[u]),/permission denied/);await assert.rejects(bet('ace','yes',5,1),/permission denied/);await db.exec('reset role')}
 }finally{await db.close()}
});
