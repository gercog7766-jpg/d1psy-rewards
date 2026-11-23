import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {nightRunCore} from '../src/night-run-core.ts';
import {nightRunHtml} from '../src/night-run-ui.ts';
const core=runInNewContext(nightRunCore);

function desired(g){if(g.next_coin_distance-g.distance<=Math.max(800,core.speedFor(g)*5))return core.hash(g.seed+999,g.coin_index)%3;for(let row=Math.floor(g.distance/1000)+1;row<Math.floor(g.distance/1000)+12;row++){const blocks=core.blocksFor(g,row);if(blocks.length)return [0,1,2].filter(l=>!blocks.includes(l)).sort((a,b)=>Math.abs(a*1000-g.position)-Math.abs(b*1000-g.position))[0]}return Math.round(g.position/1000)}
test('version 5 has hidden variable coin timing, compounded integer speed, proportional distance and four visual phases',()=>{
 const gaps=new Set();for(let seed=1;seed<=20;seed++)for(let i=1;i<=40;i++){const gap=core.coinGapV5(seed,i);assert(gap>=550&&gap<=650);gaps.add(gap)}assert(gaps.size>80);
 assert.deepEqual(Array.from({length:8},(_,i)=>core.speedV5(i)/4),[20,22,24,26,29,32,35,39]);
 let g=core.initialV5(73471);for(let i=0;i<5500;i++){const before=g;g=core.step(g,desired(g));assert.equal(g.status,'playing');assert.equal(g.distance-before.distance,core.speedFor(before));assert.equal(g.distance+(g.next_coin_tick-g.tick)*core.speedFor(g),g.next_coin_distance)}assert(g.collected_coins>=8);
 const first=core.initialV5(73471),avoid=(core.hash(first.seed+999,first.coin_index)%3+1)%3;g=core.step({...first,tick:first.next_coin_tick-1,distance:first.next_coin_distance-80,position:avoid*1000,lane:avoid},avoid);assert.equal(g.collected_coins,0);assert.equal(core.speedFor(g),80);
 assert.deepEqual([0,49999,50000,99999,100000,149999,150000,900000].map(d=>core.palette(d)[1]),['#4cf5a0','#4cf5a0','#ffdb55','#ffdb55','#ff5c83','#ff5c83','#5cafff','#5cafff']);
 assert(!/Монеты каждые|55[–-]65|40[–-]55/.test(nightRunHtml));assert.equal(core.speedV4(3),104);
});

test('combined migration preserves active old runs, verifies version 5 on server and optimizes large Minesweeper flood', {timeout:30000},async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table rewards_users(id uuid primary key,banned boolean default false,twitch_login text,twitch_display_name text);create table rewards_coin_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,amount int,transaction_type text,note text);grant select,insert,update on rewards_users,rewards_coin_transactions to service_role;
 `);
 await db.exec(await readFile(new URL('../supabase/migrations/20261106035441_defuse_game.sql',import.meta.url),'utf8'));
 for(const name of ['20261106234339_minesweeper_game.sql','20261107000553_minesweeper_time_limits.sql','20261107152707_minesweeper_board_and_time_settings.sql','20261108093641_night_run_arcade.sql','20261108100118_night_run_v2_movement_and_pickups.sql','20261108102254_night_run_top_ten.sql','20261105201910_games_wordly.sql','20261105203147_wordly_win_reward.sql','20261108125019_game_timed_leaderboards_and_nr_cooldown.sql','20261108131406_night_run_reserve_collisions_and_cashout.sql','20261108131909_night_run_progressive_collision_penalties.sql','20261108190625_weekly_game_tournaments_and_prizes.sql','20261108194644_night_run_pickup_speed_and_three_lives.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 const legacyUser=randomUUID(),legacyId=randomUUID(),user=randomUUID(),id=randomUUID(),miner=randomUUID();for(const u of [legacyUser,user,miner])await db.query('insert into rewards_users(id,twitch_login,twitch_display_name) values($1,$2,$2)',[u,u]);
 await db.query('select rewards_nr_start_v4($1,$2,73471)',[legacyUser,legacyId]);
 await db.exec(await readFile(new URL('../supabase/migrations/20261120113000_game_performance_night_run_v5.sql',import.meta.url),'utf8'));
 const rpc=async(sql,args)=>(await db.query(sql,args)).rows[0].r;
 let g=(await rpc('select rewards_nr_start_v5($1,$2,73471) r',[user,id])).game;assert.equal(g.version,5);assert.equal(g.next_coin_tick,core.coinGapV5(73471,1));
 const old=(await rpc('select rewards_nr_start_v5($1,$2,1) r',[legacyUser,randomUUID()])).game;assert.equal(old.version,4);assert.equal(old.id,legacyId);
 for(let i=0;i<12;i++)assert.equal((await rpc('select rewards_nr_speed_v5($1) r',[i])),core.speedV5(i));
 while(g.collected_coins<3){const inputs=[];let expected={...g};for(let i=0;i<30;i++){const lane=desired(expected);inputs.push(lane);expected=core.step(expected,lane)}await db.query("update rewards_nr_games set started_at=clock_timestamp()-($2*interval '0.1 seconds')-interval '30 milliseconds',last_seen=clock_timestamp() where id=$1",[id,expected.tick]);const previous=g.tick;g=(await rpc('select rewards_nr_step($1,$2,$3,$4,false) r',[user,id,previous,inputs])).game;for(const key of ['tick','distance','position','coins','collected_coins','next_coin_tick','next_coin_distance','last_coin_distance','status'])assert.equal(g[key],expected[key],key);}
 const ended=(await rpc('select rewards_nr_step($1,$2,$3,$4,true) r',[user,id,g.tick,[]])).game;assert.equal(ended.paid_coins,3);assert.equal((await db.query('select sum(amount)::int n from rewards_coin_transactions where user_id=$1',[user])).rows[0].n,3);const replay=await rpc('select rewards_nr_step($1,$2,$3,$4,true) r',[user,id,g.tick,[]]);assert.equal(replay.game.paid_coins,3);
 const ranking=await rpc('select rewards_nr_leaderboard($1) r',[user]);assert.equal(ranking.entries.find(e=>e.isMe).distanceMeters,Math.floor(ended.distance/40));
 const expiredUser=randomUUID(),expiredId=randomUUID();await db.query('insert into rewards_users(id) values($1)',[expiredUser]);await db.query('select rewards_nr_start_v5($1,$2,73471)',[expiredUser,expiredId]);await db.query("update rewards_nr_games set collected_coins=1,coins=1,last_seen=clock_timestamp()-interval '9 seconds' where id=$1",[expiredId]);await db.query('select rewards_nr_expire_v3(30)');const expired=(await rpc('select rewards_nr_state($1) r',[expiredUser])).game;assert.equal(expired.status,'expired');assert.equal(expired.paid_coins,1);
 await db.query("select rewards_ms_configure('easy',1,0,25,25,900)");let ms=await rpc("select rewards_ms_start($1,$2,'easy') r",[miner,randomUUID()]);assert.equal(ms.game.cells.length,625);assert(ms.game.cells.every(c=>!c.mine&&c.value===null));await db.query('update rewards_ms_games set mines=array[0] where id=$1',[ms.game.id]);const request=randomUUID();ms=await rpc("select rewards_ms_move($1,$2,0,'open',624,$3) r",[miner,ms.game.id,request]);assert.equal(ms.game.status,'won');assert.equal(ms.game.cells.filter(c=>c.open).length,624);assert.equal(ms.game.cells[1].value,1);assert.equal(ms.game.cells[624].value,0);assert.equal(ms.game.cells[0].mine,true);assert.equal((await db.query('select sum(amount)::int n from rewards_coin_transactions where user_id=$1',[miner])).rows[0].n,5);await rpc("select rewards_ms_move($1,$2,0,'open',624,$3) r",[miner,ms.game.id,request]);assert.equal((await db.query('select sum(amount)::int n from rewards_coin_transactions where user_id=$1',[miner])).rows[0].n,5);
 await db.exec('set role anon');await assert.rejects(db.query('select rewards_nr_start_v5($1,$2,1)',[user,randomUUID()]),/permission denied/);await db.exec('reset role');
 await db.exec(await readFile(new URL('../supabase/migrations/20261123100000_live_economy_game_rewards.sql',import.meta.url),'utf8'));
 assert.deepEqual((await db.query('select reward from rewards_ms_settings order by reward')).rows.map(x=>x.reward),[2,5,10]);
 assert.equal((await db.query("select reward from rewards_ms_games where id=$1",[ms.game.id])).rows[0].reward,5,'historic reward unchanged');
 await db.query("update rewards_nr_games set status='stopped',coins=15,collected_coins=15 where id=$1",[legacyId]);await db.query('select rewards_nr_settle_v3($1,$2)',[legacyUser,legacyId]);assert.equal((await db.query('select paid_coins from rewards_nr_games where id=$1',[legacyId])).rows[0].paid_coins,10);
 const day=(await db.query("select (now() at time zone 'Europe/Moscow')::date::text d")).rows[0].d;const w=(await rpc('select rewards_wordly_guess($1,$2,$3,$4,$3) r',[user,day,'лампа',randomUUID()]));assert.equal(w.reward_coins,10);
 const defuseId=randomUUID();await db.query("select rewards_defuse_start($1,$2,'rookie',$3)",[user,defuseId,JSON.stringify([{answer:'1'},{answer:'2'},{answer:'3'}])]);for(let i=0;i<3;i++){await db.query("update rewards_defuse_games set ready_at=clock_timestamp()-interval '1 second' where id=$1",[defuseId]);await db.query('select rewards_defuse_answer($1,$2,$3,$4,$5)',[user,defuseId,i,String(i+1),randomUUID()])}assert.equal((await db.query('select reward_coins from rewards_defuse_games where id=$1',[defuseId])).rows[0].reward_coins,3);
 assert.equal((await db.query("select rewards_game_week_prize('night-run','overall',1) n")).rows[0].n,0);
 }finally{await db.close()}
});
