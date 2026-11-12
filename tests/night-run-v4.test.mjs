import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {runInNewContext} from 'node:vm';import {PGlite} from '@electric-sql/pglite';import {JSDOM} from 'jsdom';import {nightRunCore} from '../src/night-run-core.ts';import {nightRunHtml,nightRunJs} from '../src/night-run-ui.ts';
const core=runInNewContext(nightRunCore);
function desired(g){if(g.next_coin_distance-g.distance<=Math.max(800,core.speedFor(g)*5))return core.hash(g.seed+999,g.coin_index)%3;for(let r=Math.floor(g.distance/1000)+1;r<Math.floor(g.distance/1000)+12;r++){const blocks=core.blocksFor(g,r);if(blocks.length)return [0,1,2].filter(l=>!blocks.includes(l)).sort((a,b)=>Math.abs(a*1000-g.position)-Math.abs(b*1000-g.position))[0]}return Math.round(g.position/1000)}
test('v4 coins keep a 40–55s clock, accelerate only on pickup, remain reachable and leave old physics unchanged',()=>{const gaps=[];for(let seed=1;seed<=20;seed++){let g=core.initialV4(seed);assert.equal(core.speedFor(g),80);for(let i=1;i<=40;i++)gaps.push(core.coinGapV4(seed,i));for(let tick=0;tick<4500;tick++){const old={...g},lane=desired(g);g=core.step(g,lane);assert.equal(g.status,'playing','safe route '+seed+' tick '+tick);assert.equal(g.distance-old.distance,80+8*old.collected_coins);assert.equal(core.speedFor(g),80+8*g.collected_coins);assert.equal(g.distance+(g.next_coin_tick-g.tick)*core.speedFor(g),g.next_coin_distance);if(g.collected_coins>old.collected_coins)assert.equal(core.speedFor(g)-core.speedFor(old),8)}assert.equal(g.collected_coins,g.coin_index-1)}assert(gaps.every(x=>x>=400&&x<=550));assert(new Set(gaps).size>100);
 let g=core.initialV4(73471);const avoid=(core.hash(g.seed+999,g.coin_index)%3+1)%3;g=core.step({...g,tick:g.next_coin_tick-1,distance:g.next_coin_distance-80,position:avoid*1000,lane:avoid},avoid);assert.equal(g.collected_coins,0);assert.equal(core.speedFor(g),80,'a missed coin does not accelerate');assert.equal(core.coinGap(73471,1),core.initialV3(73471).next_coin_tick);
});
test('v4 SQL/client replay, 6/9/5 capped reserve losses, third-hit settlement, no wallet debit, retries, cooldown and private access',{timeout:30000},async()=>{const db=new PGlite();try{await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table rewards_users(id uuid primary key,banned boolean default false,twitch_login text,twitch_display_name text);create table rewards_coin_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,amount int,transaction_type text,note text);grant select,insert,update on rewards_users,rewards_coin_transactions to service_role;
 create table rewards_ms_games(id uuid primary key,user_id uuid,difficulty text,status text,started_at timestamptz,finished_at timestamptz,reward_transaction_id uuid,width int,height int,mine_count int,time_seconds int);create table rewards_ms_settings(difficulty text primary key,width int,height int,mines int,time_seconds int);create table rewards_defuse_games(id uuid primary key,user_id uuid,difficulty text,status text,started_at timestamptz,finished_at timestamptz,reward_transaction_id uuid);grant select,insert,update on rewards_ms_games,rewards_ms_settings,rewards_defuse_games to service_role;`);
 for(const name of ['20261108093641_night_run_arcade.sql','20261108100118_night_run_v2_movement_and_pickups.sql','20261108102254_night_run_top_ten.sql','20261105201910_games_wordly.sql','20261105203147_wordly_win_reward.sql','20261108125019_game_timed_leaderboards_and_nr_cooldown.sql','20261108131406_night_run_reserve_collisions_and_cashout.sql','20261108131909_night_run_progressive_collision_penalties.sql','20261108190625_weekly_game_tournaments_and_prizes.sql','20261108194644_night_run_pickup_speed_and_three_lives.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 const create=async()=>{await db.exec('reset role');const user=randomUUID(),id=randomUUID();await db.query('insert into rewards_users(id) values($1)',[user]);await db.query("insert into rewards_coin_transactions(user_id,amount,transaction_type,note) values($1,100,'adjustment','existing wallet')",[user]);await db.exec('set role service_role');return {user,id,g:(await db.query('select rewards_nr_start_v4($1,$2,73471) r',[user,id])).rows[0].r.game}};
 const step=async(a,from,inputs,stop=false)=>(await db.query('select rewards_nr_step($1,$2,$3,$4,$5) r',[a.user,a.id,from,inputs,stop])).rows[0].r.game;
 const clock=async(a,tick)=>{await db.exec('reset role');await db.query("update rewards_nr_games set started_at=clock_timestamp()-($2*interval '0.1 seconds')-interval '30 milliseconds',last_seen=clock_timestamp() where id=$1",[a.id,tick]);await db.exec('set role service_role')};
 const same=(a,b)=>{for(const k of ['tick','position','distance','coins','collected_coins','lost_coins','hits','status','next_coin_distance','last_coin_distance','next_coin_tick','invulnerable_until_tick'])assert.equal(a[k],b[k],k)};
 const collect=async(a,n)=>{while(a.g.coins<n){const from=a.g.tick,inputs=[];let expected={...a.g};for(let i=0;i<20;i++){const lane=desired(expected);inputs.push(lane);expected=core.step(expected,lane)}await clock(a,expected.tick);a.g=await step(a,from,inputs);same(a.g,expected)}};
 const hit=async(a,protect=false)=>{let row=Math.floor(a.g.distance/1000)+2;while(!core.blocksFor(a.g,row).length)row++;const lane=core.blocksFor(a.g,row)[0];await db.exec('reset role');await db.query('update rewards_nr_games set distance=$2,position=$3,lane=$4,invulnerable_until_tick=$5 where id=$1',[a.id,row*1000-1,lane*1000,lane,protect?a.g.tick+10:0]);await db.exec('set role service_role');a.g=(await db.query('select * from rewards_nr_games where id=$1',[a.id])).rows[0];const from=a.g.tick,expected=core.step(a.g,lane);await clock(a,from+1);a.g=await step(a,from,[lane]);same(a.g,expected);return {from,lane}};
 const a=await create();assert.equal(a.g.version,4);await collect(a,8);
 // Trusted test fixture isolates all three penalty amounts from the long-run difficulty curve.
 await db.exec('reset role');await db.query('update rewards_nr_games set coins=26,collected_coins=26 where id=$1',[a.id]);await db.exec('set role service_role');a.g=(await db.query('select * from rewards_nr_games where id=$1',[a.id])).rows[0];await hit(a);assert.equal(a.g.coins,20);assert.equal(a.g.hits,1);assert.equal(a.g.status,'playing');await hit(a,true);assert.equal(a.g.hits,1,'protected obstacles do not consume another life');await hit(a);assert.equal(a.g.coins,11);assert.equal(a.g.hits,2);const checkpoint=await hit(a);assert.equal(a.g.coins,6);assert.equal(a.g.hits,3);assert.equal(a.g.status,'crashed');assert.equal(a.g.paid_coins,6);assert.equal(a.g.lost_coins,20);assert(a.g.finished_at);await step(a,checkpoint.from,[checkpoint.lane]);await db.query('select rewards_nr_state($1)',[a.user]);assert.equal((await db.query('select sum(amount)::int n from rewards_coin_transactions where user_id=$1',[a.user])).rows[0].n,106,'only remaining run coins credited, wallet never debited');assert.equal((await db.query("select count(*)::int n from rewards_nr_v3_events where game_id=$1 and kind='hit'",[a.id])).rows[0].n,3);assert.equal((await db.query('select rewards_nr_start_v4($1,$2,1) r',[a.user,randomUUID()])).rows[0].r.game.id,a.id,'four-hour cooldown remains');
 const zero=await create();for(let i=0;i<3;i++){await hit(zero);assert.equal(zero.g.coins,0);assert.equal(zero.g.status,i===2?'crashed':'playing')}assert.equal((await db.query('select sum(amount)::int n from rewards_coin_transactions where user_id=$1',[zero.user])).rows[0].n,100);
 const low=await create();await collect(low,2);await hit(low);assert.equal(low.g.coins,0);assert.equal(low.g.lost_coins,2);assert.equal(low.g.status,'playing');low.g=await step(low,low.g.tick,[],true);assert.equal(low.g.paid_coins,0);
 const cash=await create();await collect(cash,2);const before=cash.g.tick;await db.exec('reset role;revoke insert on rewards_coin_transactions from service_role;set role service_role');await assert.rejects(step(cash,before,[],true),/permission denied/);assert.equal((await db.query('select status from rewards_nr_games where id=$1',[cash.id])).rows[0].status,'playing');await db.exec('reset role;grant insert on rewards_coin_transactions to service_role;set role service_role');cash.g=await step(cash,before,[],true);assert.equal(cash.g.paid_coins,2);await step(cash,before,[],true);assert.equal((await db.query('select sum(amount)::int n from rewards_coin_transactions where user_id=$1',[cash.user])).rows[0].n,102);
 const expired=await create();await collect(expired,1);await db.exec('reset role');await db.query("update rewards_nr_games set last_seen=clock_timestamp()-interval '9 seconds' where id=$1",[expired.id]);await db.exec('set role service_role');await db.query('select rewards_nr_expire_v3(30)');const ended=(await db.query('select rewards_nr_state($1) r',[expired.user])).rows[0].r.game;assert.equal(ended.status,'expired');assert.equal(ended.paid_coins,1);
 const legacyUser=randomUUID(),legacyId=randomUUID();await db.exec('reset role');await db.query('insert into rewards_users(id) values($1)',[legacyUser]);await db.query('insert into rewards_nr_games(id,user_id,seed,version,coins,collected_coins,next_coin_tick) values($1,$2,73471,3,1,1,400)',[legacyId,legacyUser]);await db.exec('set role service_role');assert.equal((await db.query('select rewards_nr_start_v4($1,$2,1) r',[legacyUser,randomUUID()])).rows[0].r.game.id,legacyId,'an old active run resumes without migration');const legacy=await step({user:legacyUser,id:legacyId},0,[],true);assert.equal(legacy.version,3);assert.equal(legacy.paid_coins,1,'old reserve pays under its original rules');
 const fresh=randomUUID();await db.exec('reset role');await db.query('insert into rewards_users(id) values($1)',[fresh]);await db.exec('set role service_role');await assert.rejects(db.query('select rewards_nr_start_v3($1,$2,1)',[fresh,randomUUID()]),/client_update_required/);await assert.rejects(step({...cash,user:fresh},before,[],true),/game_not_found/);await db.exec("reset role;create or replace function public.rewards_weekly_now() returns timestamptz language sql stable security invoker set search_path='' as $$select '2026-11-09T12:00:00+03:00'::timestamptz$$;set role service_role");await db.query("insert into rewards_nr_games(id,user_id,seed,version,distance,tick,hits,status,started_at,last_seen) values($1,$2,1,4,24000,1000,3,'crashed','2026-11-09T10:00:00+03:00','2026-11-09T10:01:40+03:00')",[randomUUID(),fresh]);const ranking=(await db.query('select rewards_nr_leaderboard($1) r',[fresh])).rows[0].r;assert.equal(ranking.entries.find(entry=>entry.isMe).distanceMeters,600,'v4 distance uses world units in weekly tops');await db.exec('reset role;set role anon');await assert.rejects(db.query('select rewards_nr_start_v4($1,$2,1)',[fresh,randomUUID()]),/permission denied/);
 }finally{await db.close()}});
test('three hearts persist across reload, grey out per hit, and show a readable life count',async()=>{for(let hits=0;hits<=3;hits++){const dom=new JSDOM(nightRunHtml,{runScripts:'outside-only'}),w=dom.window;try{const game={id:randomUUID(),...core.initialV4(73471),hits,status:hits===3?'crashed':'playing',paid_coins:7};w.requestAnimationFrame=()=>1;w.HTMLCanvasElement.prototype.getContext=()=>null;w.fetch=async path=>({ok:true,status:200,json:async()=>path.endsWith('leaderboard')?{entries:[]}:{game}});w.eval(nightRunJs);await new Promise(r=>setTimeout(r,10));const hearts=w.document.getElementById('nrHearts');assert.equal(hearts.hidden,false);assert.equal(hearts.children.length,3);assert.equal(hearts.querySelectorAll('.lost').length,hits);assert.equal(hearts.getAttribute('aria-label'),'Жизни: '+(3-hits)+' из 3');if(hits===3)assert(w.document.getElementById('nrMessage').textContent.includes('7 монет зачислено'));}finally{w.close()}}});

test('Night Run recovers a stalled tenth-coin response and continues with keyboard or touch', async () => {
 for (const mobile of [false, true]) {
  const dom = new JSDOM(nightRunHtml, {runScripts: 'outside-only'});
  const w = dom.window;
  try {
   const frames = [], timers = new Map(), intervals = new Map(), requests = [];
   let clock = 1000, nextTimer = 0, server = {id: randomUUID(), ...core.initialV4(73471)};
   while (server.coin_index < 10 || server.next_coin_tick - server.tick > 6) {
    server = core.step(server, desired(server));
    assert.equal(server.status, 'playing');
   }
   assert.equal(server.collected_coins, 9);
   w.performance.now = () => clock;
   w.requestAnimationFrame = callback => frames.push(callback);
   w.setTimeout = (callback, delay) => {
    const id = ++nextTimer;
    timers.set(id, {callback, at: clock + delay});
    return id;
   };
   w.clearTimeout = id => timers.delete(id);
   w.setInterval = (callback, delay) => intervals.set(delay, callback);
   w.matchMedia = query => ({matches: mobile ? query === '(max-width:760px)' : query.includes('pointer:fine')});
   w.HTMLCanvasElement.prototype.getContext = () => null;
   let releaseRetry;
   w.fetch = async (path, options) => {
    if (path.endsWith('leaderboard')) return {ok: true, json: async () => ({entries: []})};
    if (path.endsWith('/step')) {
     const request = JSON.parse(options.body);
     requests.push(request);
     if (request.from === server.tick) {
      for (const lane of request.inputs) server = core.step(server, lane);
     }
     if (requests.length === 1) {
      return {ok: true, json: () => new Promise((_, reject) => {
       options.signal?.addEventListener('abort', () => reject(options.signal.reason), {once: true});
      })};
     }
     if (requests.length === 2) await new Promise(resolve => {releaseRetry = resolve});
    }
    const game = {...server};
    return {ok: true, json: async () => ({game})};
   };
   const settle = () => new Promise(resolve => setImmediate(resolve));
   const frame = async (elapsed = 100) => {
    clock += elapsed;
    for (const [id, timer] of timers) {
     if (timer.at <= clock) {
      timers.delete(id);
      timer.callback();
     }
    }
    frames.shift()(clock);
    await settle();
   };
   const q = id => w.document.getElementById(id);
   const coinLane = desired(server);
   let target = server.lane;
   function steer(direction) {
    if (!mobile) {
     w.document.dispatchEvent(new w.KeyboardEvent('keydown', {key: direction > 0 ? 'ArrowRight' : 'ArrowLeft'}));
    } else {
     const canvas = q('nrCanvas');
     canvas.dispatchEvent(new w.MouseEvent('pointerdown', {clientX: 50, clientY: 20}));
     canvas.dispatchEvent(new w.MouseEvent('pointerup', {clientX: 50 + 35 * direction, clientY: 20}));
    }
    target += direction;
   }
   w.eval(nightRunJs);
   await settle();
   while (target !== coinLane) steer(Math.sign(coinLane - target));
   for (let i = 0; i < 6; i++) await frame();
   assert.equal(server.collected_coins, 10, 'server applied the pickup before the response stalled');
   assert.equal(requests.length, 1);

   for (let i = 0; i < 25; i++) await frame();
   assert.match(q('nrMessage').textContent, /не ответил вовремя/);
   intervals.get(1000)();
   await settle();
   assert.deepEqual(requests[1], requests[0], 'retry sends the same checkpoint');
   assert.equal(server.collected_coins, 10, 'retry cannot pick up the same coin twice');

   for (let i = 0; i < 15; i++) await frame();
   releaseRetry();
   await settle();
   assert.equal(q('nrCoins').textContent, '10 монет');
   const expectedTick = server.tick + 40;
   for (let i = 0; i < 6; i++) await frame(0);
   intervals.get(1000)();
   await settle();
   for (let i = 0; i < 5; i++) {
    await frame(0);
    intervals.get(1000)();
    await settle();
   }
   assert.equal(server.tick, expectedTick, 'elapsed time was retained when the input queue filled');
   let predicted = {...server};
   const eleventhCoin = predicted.next_coin_tick;
   while (predicted.tick < eleventhCoin) {
    const lane = desired(predicted);
    while (target !== lane) steer(Math.sign(lane - target));
    predicted = core.step(predicted, target);
    assert.equal(predicted.status, 'playing');
    await frame();
   }
   assert.equal(server.collected_coins, 11);
   assert.equal(server.coins, 11 - server.lost_coins);
   assert.equal(parseInt(q('nrCoins').textContent, 10), server.coins);
   assert.equal(q('nrLeft').disabled, false);
   assert(requests.every(request => !request.stop));
  } finally {
   w.close();
  }
 }
});

test('Night Run continues past 500 m after a short foreground browser stall', async () => {
 const dom = new JSDOM(nightRunHtml, {runScripts: 'outside-only'});
 const w = dom.window;
 try {
  const frames = [], requests = [];
  let clock = 1000, server = {id: randomUUID(), ...core.initialV4(73471)};
  while (server.distance < 19800) server = core.step(server, desired(server));
  w.performance.now = () => clock;
  w.requestAnimationFrame = callback => frames.push(callback);
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.fetch = async (path, options) => {
   if (path.endsWith('leaderboard')) return {ok: true, json: async () => ({entries: []})};
   if (path.endsWith('/step')) {
    const request = JSON.parse(options.body);
    requests.push(request);
    for (const lane of request.inputs) server = core.step(server, lane);
   }
   const game = {...server};
   return {ok: true, json: async () => ({game})};
  };
  w.eval(nightRunJs);
  await new Promise(resolve => setImmediate(resolve));
  const before = server.tick;
  clock += 2900;
  for (let i = 0; i < 5; i++) {
   frames.shift()(clock);
   await new Promise(resolve => setImmediate(resolve));
  }
  assert(parseInt(w.document.getElementById('nrDistance').textContent, 10) > 500);
  assert(server.tick > before);
  assert(requests.every(request => !request.stop));
  assert.equal(w.document.getElementById('nrLeft').disabled, false);
 } finally {
  w.close();
 }
});
