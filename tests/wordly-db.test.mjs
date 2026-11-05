import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('database enforces persistent daily game, replay protection, limits and permissions',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table public.rewards_users(id uuid primary key);
 insert into public.rewards_users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261105201910_games_wordly.sql',import.meta.url),'utf8'));
 const {rows:[{day}]}=await db.query("select ((clock_timestamp() at time zone 'Europe/Moscow')::date)::text as day");
 const uid='00000000-0000-4000-8000-000000000001',uid2='00000000-0000-4000-8000-000000000002';
 await db.exec('set role service_role');
 async function guess(user,word,id=randomUUID(),answer='лампа',date=day){return (await db.query('select public.rewards_wordly_guess($1,$2,$3,$4,$5) as game',[user,date,word,id,answer])).rows[0].game}
 const rid=randomUUID();let g=await guess(uid,'банан',rid);
 assert.deepEqual(g.guesses,['банан']);
 g=await guess(uid,'банан',rid,'кошка');assert.equal(g.answer,'лампа');assert.equal(g.guesses.length,1);
 await assert.rejects(guess(uid,'кошка',rid),/invalid_request/);
 await Promise.all(Array.from({length:10},()=>guess(uid,'банан')));
 g=await guess(uid,'лампа');assert.equal(g.guesses.length,6);assert(!g.guesses.includes('лампа'));
 g=await guess(uid2,'кошка',randomUUID(),'кошка');assert.equal(g.guesses.length,1);
 g=await guess(uid2,'банан');assert.equal(g.guesses.length,1);
 await assert.rejects(guess(uid2,'банан',randomUUID(),'кошка','2000-01-01'),/new_day/);
 await db.exec('reset role;set role anon');
 await assert.rejects(db.query('select * from public.rewards_wordly_games'),/permission denied/);
 await assert.rejects(guess(uid,'банан'),/permission denied/);
 await db.exec('reset role;set role authenticated');
 await assert.rejects(db.query('select * from public.rewards_wordly_games'),/permission denied/);
 await assert.rejects(guess(uid,'банан'),/permission denied/);
 } finally {await db.close()}
});
