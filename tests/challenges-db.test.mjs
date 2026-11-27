import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('challenge pilot reserves once, settles both outcomes and excludes uninvited users',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
  create table rewards_users(id uuid primary key,twitch_user_id text,twitch_login text,banned boolean default false);
  create table rewards_admins(twitch_user_id text primary key);
  create table rewards_streamers(twitch_broadcaster_id text,is_primary boolean,enabled boolean);
  create table rewards_coin_transactions(user_id uuid,amount integer,transaction_type text,note text);`);
  const owner=randomUUID(),player=randomUUID(),outsider=randomUUID();
  await db.query("insert into rewards_users values($1,'1','owner',false),($2,'2','player',false),($3,'3','outsider',false)",[owner,player,outsider]);
  await db.exec("insert into rewards_admins values('1');insert into rewards_streamers values('1',true,true)");
  await db.query("insert into rewards_coin_transactions values($1,500,'adjustment','seed')",[player]);
  await db.exec(await readFile(new URL('../supabase/migrations/20261127190000_owner_challenges_pilot.sql',import.meta.url),'utf8'));
  const call=async(actor,action,body={})=>(await db.query('select rewards_challenges_rpc($1,$2,$3) result',[actor,action,JSON.stringify(body)])).rows[0].result;
  const balance=async()=>Number((await db.query('select sum(amount) amount from rewards_coin_transactions where user_id=$1',[player])).rows[0].amount);
  await assert.rejects(call('2','state'),/pilot_closed/);
  await call('1','invite',{login:'player'});
  await assert.rejects(call('3','state'),/pilot_closed/);
  const create=async()=>{const body={id:randomUUID(),description:'15 kills',stake:100};const a=await call('2','create',body);assert.deepEqual(await call('2','create',body),a);return a.id};
  const declined=await create();await call('1','decline',{id:declined});assert.equal(await balance(),500);
  const completed=await create();await assert.rejects(call('2','accept',{id:completed}),/owner_required/);
  await call('1','accept',{id:completed});await call('1','accept',{id:completed});assert.equal(await balance(),400);
  await call('1','complete',{id:completed});assert.equal(await balance(),400);await assert.rejects(call('1','fail',{id:completed}),/invalid_status/);
  const failed=await create();await call('1','accept',{id:failed});assert.equal(await balance(),300);
  await call('1','fail',{id:failed});await call('1','fail',{id:failed});assert.equal(await balance(),500);
  assert.equal((await call('1','admin_state')).rows.length,3);
  assert.equal((await call('2','state')).rows.find(r=>r.id===failed).status,'failed');
  await db.exec(await readFile(new URL('../supabase/migrations/20261127202000_open_owner_challenges_to_players.sql',import.meta.url),'utf8'));
  assert.equal((await call('3','state')).owner,'owner');
  await assert.rejects(call('3','admin_state'),/owner_required/);
 }finally{await db.close()}
});
