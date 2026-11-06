import {PGlite} from '@electric-sql/pglite';import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {createDefusePuzzles,publicDefuse} from '../src/defuse-game.ts';

test('Defuse: rolling shared four-hour cooldown, authoritative stages/deadline, idempotent rewards and private answers',async()=>{
 const db=new PGlite(),a=randomUUID(),b=randomUUID();const rows=async(q,p=[]) => (await db.query(q,p)).rows;
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table rewards_users(id uuid primary key,banned boolean default false);create table rewards_coin_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,amount integer,transaction_type text,note text);`);
 await db.query('insert into rewards_users(id) values($1),($2)',[a,b]);await db.exec(await readFile(new URL('../supabase/migrations/20261106035441_defuse_game.sql',import.meta.url),'utf8'));await db.exec(await readFile(new URL('../supabase/migrations/20261106040950_defuse_shorter_timers.sql',import.meta.url),'utf8'));
 const call=async(name,args,casts)=> (await rows('select public.rewards_defuse_'+name+'('+args.map((_,i)=>'$'+(i+1)+(casts?.[i]||'')).join(',')+') r',args))[0].r;
 const start=(u,id,level)=>call('start',[u,id,level,JSON.stringify(createDefusePuzzles(level))],['','','','::jsonb']);
 const answer=(u,g,stage,text,request=randomUUID())=>call('answer',[u,g,stage,text,request]);
 assert.equal((await call('state',[a])).game,null);
 const id=randomUUID(),g=(await start(a,id,'rookie')).game;assert.equal(g.difficulty,'rookie');assert.equal(Date.parse(g.deadline)-Date.parse(g.started_at),45000);assert.equal(Date.parse(g.next_available_at)-Date.parse(g.started_at),4*3600000);
 assert.equal((await start(a,randomUUID(),'expert')).game.id,id);assert.equal((await start(a,id,'rookie')).game.id,id);assert.equal((await rows('select count(*) n from rewards_defuse_games'))[0].n,1);
 await assert.rejects(answer(b,id,0,'0000'),/game_not_found/);await assert.rejects(answer(a,id,0,g.puzzles[0].answer),/memorize_first/);
 const publicPreview=publicDefuse({serverNow:g.started_at,game:g});assert.equal(publicPreview.game.challenge.preview,g.puzzles[0].answer);assert(!JSON.stringify(publicPreview).includes('"answer"'));assert(!JSON.stringify(publicPreview).includes('request_payloads'));
 const later=publicDefuse({serverNow:g.ready_at,game:g});assert.equal(later.game.challenge.preview,undefined);assert.equal(later.game.challenge.sequence,undefined);
 await db.query("update rewards_defuse_games set ready_at=clock_timestamp()-interval '1 second' where id=$1",[id]);
 const wrong=g.puzzles[0].answer==='0000'?'1111':'0000',request=randomUUID();const r=await answer(a,id,0,wrong,request);assert.equal(r.game.mistakes,1);assert.equal(Date.parse(g.deadline)-Date.parse(r.game.deadline),5000);
 assert.equal((await answer(a,id,0,wrong,request)).game.mistakes,1);await assert.rejects(answer(a,id,0,'9999',request),/invalid_request/);
 await answer(a,id,0,g.puzzles[0].answer);await assert.rejects(answer(a,id,0,g.puzzles[0].answer),/stale_stage/);
 await answer(a,id,1,g.puzzles[1].answer);await db.query("update rewards_defuse_games set ready_at=clock_timestamp()-interval '1 second' where id=$1",[id]);
 // A coin ledger failure rolls the final answer back, so it can be retried safely.
 await db.exec('alter table rewards_coin_transactions add constraint test_failure check(amount<0)');await assert.rejects(answer(a,id,2,g.puzzles[2].answer),/test_failure/);assert.equal((await call('state',[a])).game.stage,2);await db.exec('alter table rewards_coin_transactions drop constraint test_failure');
 const last=randomUUID(),won=await answer(a,id,2,g.puzzles[2].answer,last);assert.equal(won.game.status,'won');assert.equal(publicDefuse(won).game.rewardCoins,10);assert.equal(publicDefuse(won).game.challenge,null);
 await answer(a,id,2,g.puzzles[2].answer,last);await answer(a,id,2,g.puzzles[2].answer);assert.equal((await rows('select count(*) n from rewards_coin_transactions'))[0].n,1);
 // Shared cooldown persists after winning, losing and across a Moscow midnight.
 assert.equal((await start(a,randomUUID(),'swat')).game.id,id);
 await db.query("update rewards_defuse_games set next_available_at=clock_timestamp()-interval '1 millisecond' where id=$1",[id]);
 for(const [level,reward] of [['swat',20],['expert',30]]){
  const newId=randomUUID(),raw=await start(a,newId,level);assert.equal(Date.parse(raw.game.deadline)-Date.parse(raw.game.started_at),level==='swat'?35000:25000);for(let stage=0;stage<3;stage++){await db.query("update rewards_defuse_games set ready_at=clock_timestamp()-interval '1 second' where id=$1",[newId]);const out=await answer(a,newId,stage,raw.game.puzzles[stage].answer);if(stage===2)assert.equal(publicDefuse(out).game.rewardCoins,reward)}await db.query("update rewards_defuse_games set next_available_at=clock_timestamp()-interval '1 second' where id=$1",[newId]);
 }
 assert.equal((await rows('select sum(amount) n from rewards_coin_transactions'))[0].n,60);
 const lostId=randomUUID(),lost=await start(b,lostId,'expert');await db.query("update rewards_defuse_games set ready_at=clock_timestamp()-interval '1 second' where id=$1",[lostId]);
 for(let i=0;i<3;i++)await answer(b,lostId,0,lost.game.puzzles[0].answer==='000000'?'111111':'000000');assert.equal((await call('state',[b])).game.status,'lost');assert.equal((await start(b,randomUUID(),'rookie')).game.id,lostId);
 await db.query("update rewards_defuse_games set next_available_at=clock_timestamp()-interval '1 second' where id=$1",[lostId]);const expired=randomUUID();await start(b,expired,'rookie');await db.query("update rewards_defuse_games set deadline=clock_timestamp()-interval '1 second' where id=$1",[expired]);assert.equal((await call('state',[b])).game.status,'lost');assert.equal((await answer(b,expired,0,'1234')).game.reward_transaction_id,null);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from rewards_defuse_games'),/permission denied/);await assert.rejects(db.query('select public.rewards_defuse_state($1)',[a]),/permission denied/);await db.exec('reset role')}
 }finally{await db.close()}
});
