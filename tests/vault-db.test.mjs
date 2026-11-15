import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import {randomUUID as uuid} from 'node:crypto';
const fixtureStart='2026-11-09T00:00:00+03:00';
const migration=new URL('../supabase/migrations/20261108203402_vault_reserved_keys_weekly_event.sql',import.meta.url),week='2026-11-09',digest='a'.repeat(64);
async function dbFixture(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table rewards_users(id uuid primary key,banned boolean default false,twitch_login text,twitch_display_name text);create table rewards_admins(twitch_user_id text primary key);insert into rewards_admins values('owner');
 create table rewards_coin_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,amount integer,transaction_type text,note text);
 create table rewards_ms_games(id uuid,user_id uuid,status text,finished_at timestamptz);create table rewards_defuse_games(id uuid,user_id uuid,status text,finished_at timestamptz);create table rewards_nr_games(id uuid,user_id uuid,status text,tick integer,finished_at timestamptz);create table rewards_wordly_games(user_id uuid,game_day date,answer text,guesses text[],finished_at timestamptz);create table rewards_ttt_rooms(id uuid,host_id uuid,guest_id uuid,status text,updated_at timestamptz);
 create table rewards_season_task_progress(user_id uuid,season_id text,task_key text,period_key text,completed_at timestamptz,sp_awarded int);create table rewards_season_daily_schedule(day date,task_key text);
 create table rewards_promo_codes(id uuid primary key,code text);create table rewards_promo_redemptions(id uuid primary key,user_id uuid,promo_id uuid,created_at timestamptz);
 create table rewards_streamers(id uuid primary key,twitch_broadcaster_id text,is_primary boolean);create table rewards_rounds(id uuid primary key,streamer_id uuid);create table rewards_wins(id uuid primary key,user_id uuid,round_id uuid,won_at timestamptz);create table rewards_streamer_live_awards(user_id uuid,win_id uuid,created_at timestamptz,broadcaster_id text,round_id uuid);
 grant select,insert,update on all tables in schema public to service_role;`);const sql=await readFile(migration,'utf8');
 // Seed the test treasury with the same fixed clock that the tests use.
 // The migration reserves the initial pool while it runs.
 const liveClock='as $$select clock_timestamp()$$;';
 assert(sql.includes(liveClock),'Vault migration clock hook changed');
 await db.exec(sql.replace(liveClock,()=>`as $$select '${fixtureStart}'::timestamptz$$;`));await db.exec(await readFile(new URL('../supabase/migrations/20261108210151_vault_configurable_key_goal.sql',import.meta.url),'utf8'));return db}
async function now(db,iso){await db.exec('reset role');await db.exec("create or replace function public.rewards_vault_now() returns timestamptz language sql volatile security invoker set search_path='' as $$select '"+iso+"'::timestamptz$$");await db.exec('set role service_role')}
const call=async(db,name,args=[])=>(await db.query('select rewards_vault_'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') r',args)).rows[0].r;
async function user(db,name='viewer'){const id=uuid();await db.query('insert into rewards_users values($1,false,$2,$2)',[id,name]);return id}
async function earn(db,u,n,kind='mission',prefix=uuid()){for(let i=0;i<n;i++)await call(db,'enqueue',[u,kind,prefix+':'+i,'2026-11-09T10:00:00+03:00',{}]);await call(db,'process',[u,1000])}
test('vault sources: actual game completion/day, scheduled missions not challenges, owner promos max10, cap50 and no browser writes',{timeout:30000},async()=>{const db=await dbFixture();try{await now(db,'2026-11-08T23:59:59+03:00');const u=await user(db);await call(db,'enqueue',[u,'game_day','before','2026-11-08T12:00:00+03:00',{}]);assert.equal((await db.query('select count(*)::int n from rewards_vault_sources')).rows[0].n,0);await now(db,'2026-11-09T12:00:00+03:00');
 const game=uuid();await db.query("insert into rewards_ms_games values($1,$2,'playing')",[game,u]);await db.query("update rewards_ms_games set status='lost' where id=$1",[game]);await db.query("insert into rewards_defuse_games values($1,$2,'playing')",[uuid(),u]);await db.query("update rewards_defuse_games set status='won' where user_id=$1",[u]);await call(db,'process',[u,100]);assert.equal((await call(db,'state',[u])).earned,1);
 await db.query("insert into rewards_season_daily_schedule values('2026-11-09','daily_bonus')");for(const [task,period] of [['daily_bonus','2026-11-09'],['upgrades_15','M2026-11-09'],['allin','season'],['sniper','season'],['closecall','season']])await db.query("insert into rewards_season_task_progress values($1,'s1',$2,$3,'2026-11-09T11:00:00+03:00',100)",[u,task,period]);await db.query("insert into rewards_season_daily_schedule values('2026-11-09','allin')");await db.query("insert into rewards_season_task_progress values($1,'s1','allin','2026-11-09','2026-11-09T11:00:00+03:00',100)",[u]);await call(db,'process',[u,100]);assert.equal((await call(db,'state',[u])).earned,3);
 for(let i=0;i<12;i++){const p=uuid();await db.query('insert into rewards_promo_codes values($1,$2)',[p,'OWNER-'+i]);await db.query("insert into rewards_promo_redemptions values($1,$2,$3,'2026-11-09T11:00:00+03:00')",[uuid(),u,p])}const str=uuid();await db.query("insert into rewards_promo_codes values($1,'STR-OTHER')",[str]);await db.query("insert into rewards_promo_redemptions values($1,$2,$3,'2026-11-09T11:00:00+03:00')",[uuid(),u,str]);await call(db,'process',[u,100]);assert.equal((await call(db,'state',[u])).earned,13);await earn(db,u,60);const state=await call(db,'state',[u]);assert.equal(state.earned,50);assert.equal(state.balance,50);assert.equal(state.remainingCap,0);assert.equal(await call(db,'process',[u,100]),0);assert.equal((await db.query('select count(*)::int n from rewards_coin_transactions')).rows[0].n,0);const publicText=JSON.stringify(state);assert(!publicText.includes(digest));assert(!publicText.includes('code_hash'));
 await db.exec('reset role;set role anon');await assert.rejects(call(db,'enqueue',[u,'mission','forged','2026-11-09T10:00:00+03:00',{}]),/permission denied/);await assert.rejects(db.query('select * from rewards_vault_wallets'),/permission denied/);await db.exec('reset role;set role authenticated');await assert.rejects(call(db,'admin',['owner','state',{}]),/permission denied/);
 }finally{await db.close()}});
test('vault contributions are irreversible/idempotent, code is gated/rate limited, proportional whole payouts use exactly the reserve, reset at Sunday20',{timeout:30000},async()=>{const db=await dbFixture();try{await now(db,'2026-11-09T12:00:00+03:00');await call(db,'admin',['owner','code',{week,digest}]);await call(db,'admin',['owner','entry',{week,enabled:true}]);const users=[];for(let i=0;i<27;i++){const u=await user(db,'u'+i);users.push(u);await earn(db,u,i===26?1:50);const request=uuid();await call(db,'contribute',[u,week,request,i===26?1:50]);await call(db,'contribute',[u,week,request,i===26?1:50]);await assert.rejects(call(db,'contribute',[u,week,request,2]),/request_conflict/)}const u=users[0];assert.equal((await call(db,'state',[u])).total,1301);assert.equal((await call(db,'state',[u])).balance,0);await assert.rejects(call(db,'contribute',[u,week,uuid(),1]),/insufficient_keys/);
 for(let i=0;i<5;i++)assert.equal((await call(db,'code',[u,week,uuid(),'b'.repeat(64)])).accepted,false);await assert.rejects(call(db,'code',[u,week,uuid(),digest]),/code_rate_limited/);await now(db,'2026-11-09T12:11:00+03:00');const req=uuid();assert.equal((await call(db,'code',[u,week,req,digest])).accepted,true);assert.equal((await call(db,'code',[u,week,req,digest])).accepted,true);assert.equal(await call(db,'settle',[week]),false);assert.equal((await db.query('select count(*)::int n from rewards_coin_transactions')).rows[0].n,0,'no early prizes');
 await now(db,'2026-11-15T19:59:59+03:00');assert.equal(await call(db,'settle',[week]),false);await now(db,'2026-11-15T20:00:00+03:00');await db.exec('reset role;revoke insert on rewards_coin_transactions from service_role;set role service_role');await assert.rejects(call(db,'settle',[week]),/permission denied/);assert.equal((await db.query('select count(*)::int n from rewards_vault_payouts')).rows[0].n,0);await db.exec('reset role;grant insert on rewards_coin_transactions to service_role;set role service_role');assert.equal(await call(db,'settle',[week]),true);assert.equal(await call(db,'settle',[week]),false);const totals=(await db.query('select sum(amount)::int n,count(*)::int count from rewards_coin_transactions')).rows[0];assert.equal(totals.n,1500);assert.equal(totals.count,27);const rewards=(await db.query('select contributed,amount from rewards_vault_payouts')).rows;for(const p of rewards)assert(Math.abs(p.amount-1500*p.contributed/1301)<1);assert.equal((await call(db,'state',[u])).closed,true);assert.equal((await call(db,'state',[u])).status,'success');await assert.rejects(call(db,'contribute',[u,week,uuid(),1]),/event_closed/);await now(db,'2026-11-16T00:00:00+03:00');const fresh=await call(db,'state',[u]);assert.equal(fresh.week,'2026-11-16');assert.equal(fresh.earned,0);assert.equal(fresh.balance,0);assert.equal(fresh.contributed,0);assert.equal(fresh.total,0);assert.equal(fresh.pool,0,'no unreserved prize promise after spent treasury');
 }finally{await db.close()}});
test('vault failure burns unspent keys and returns reserve; stream wins are once per actual broadcast, separate by channel',{timeout:30000},async()=>{const db=await dbFixture();try{await now(db,'2026-11-09T12:00:00+03:00');const u=await user(db);await earn(db,u,5);await call(db,'contribute',[u,week,uuid(),2]);const primary=uuid();await db.query("insert into rewards_streamers values($1,'111',true)",[primary]);await call(db,'stream',['111','9001','2026-11-09T09:00:00+03:00','2026-11-09T12:00:00+03:00',true]);for(let i=0;i<3;i++){const round=uuid();await db.query('insert into rewards_rounds values($1,$2)',[round,primary]);await db.query("insert into rewards_wins values($1,$2,$3,'2026-11-09T11:00:00+03:00')",[uuid(),u,round])}await call(db,'stream_wins');await call(db,'process',[u,100]);assert.equal((await call(db,'state',[u])).earned,6);await call(db,'stream_wins');await call(db,'process',[u,100]);assert.equal((await call(db,'state',[u])).earned,6);
 await call(db,'stream',['222','9002','2026-11-09T09:00:00+03:00','2026-11-09T12:00:00+03:00',true]);await db.query("insert into rewards_streamer_live_awards values($1,$2,'2026-11-09T11:00:00+03:00','222',$3)",[u,uuid(),uuid()]);await call(db,'stream_wins');await call(db,'process',[u,100]);assert.equal((await call(db,'state',[u])).earned,7);
 await now(db,'2026-11-15T20:00:00+03:00');assert.equal(await call(db,'settle',[week]),true);const s=await call(db,'state',[u]);assert.equal(s.status,'failed');assert.equal(s.balance,0);assert.equal((await db.query('select expired from rewards_vault_wallets where user_id=$1',[u])).rows[0].expired,5);assert.equal((await db.query('select count(*)::int n from rewards_coin_transactions')).rows[0].n,0);assert.equal(Number(await call(db,'available')),1500);await call(db,'tick');await now(db,'2026-11-16T00:00:00+03:00');assert.equal((await call(db,'state',[u])).pool,1500);
 }finally{await db.close()}});

test('vault recovery finds source records exactly once, uses canonical completion dates, and never grants for the Sunday gap',{timeout:30000},async()=>{const db=await dbFixture();try{await now(db,'2026-11-10T00:01:00+03:00');const u=await user(db);const id=uuid();await db.query("insert into rewards_ms_games values($1,$2,'playing','2026-11-09T23:59:59+03:00')",[id,u]);await db.query("update rewards_ms_games set status='won' where id=$1",[id]);await call(db,'backfill');await call(db,'process',[u,100]);assert.equal((await call(db,'state',[u])).earned,1);assert.equal((await db.query("select event_key from rewards_vault_sources where user_id=$1 and kind='game_day'",[u])).rows[0].event_key,'2026-11-09');await call(db,'backfill');assert.equal((await call(db,'state',[u])).earned,1);await now(db,'2026-11-15T20:00:00+03:00');await call(db,'enqueue',[u,'game_day','gap','2026-11-15T20:00:00+03:00',{}]);assert.equal((await db.query("select count(*)::int n from rewards_vault_sources where event_key='gap'")).rows[0].n,0);await call(db,'settle',[week]);const state=await call(db,'state',[u]);assert.equal(state.balance,0);await assert.rejects(call(db,'admin',['viewer','topup',{amount:1500,requestId:uuid()}]),/admin_required/);const rid=uuid();await call(db,'admin',['owner','topup',{amount:123,requestId:rid}]);await call(db,'admin',['owner','topup',{amount:123,requestId:rid}]);await assert.rejects(call(db,'admin',['owner','topup',{amount:124,requestId:rid}]),/request_conflict/);assert.equal(Number(await call(db,'available')),1623);const admin=await call(db,'admin',['owner','state',{week,offset:0,search:'viewer'}]);assert.equal(admin.memberCount,1);assert(!JSON.stringify(admin).includes('code_hash'));}finally{await db.close()}});

test('vault administration reserves actual funds, freezes cap after earnings and rejects code before all locks',{timeout:30000},async()=>{const db=await dbFixture();try{await now(db,'2026-11-09T12:00:00+03:00');const u=await user(db);await call(db,'admin',['owner','prepare',{week,pool:1000,cap:60,requestId:uuid()}]);assert.equal(Number(await call(db,'available')),500);await call(db,'admin',['owner','prepare',{week,pool:1500,cap:50,requestId:uuid()}]);assert.equal(Number(await call(db,'available')),0);await assert.rejects(call(db,'admin',['owner','prepare',{week,pool:1501,cap:50,requestId:uuid()}]),/insufficient_funds/);await call(db,'admin',['owner','code',{week,digest}]);await call(db,'admin',['owner','entry',{week,enabled:true}]);await earn(db,u,1);await call(db,'contribute',[u,week,uuid(),1]);await assert.rejects(call(db,'code',[u,week,uuid(),digest]),/code_locked/);await assert.rejects(call(db,'admin',['owner','prepare',{week,pool:1500,cap:51,requestId:uuid()}]),/season_locked/);assert.equal((await call(db,'state',[u])).keyCap,50);}finally{await db.close()}});

test('vault configurable goal: proportional positive integer locks, live changes preserve keys, code and payout use the new threshold',{timeout:30000},async()=>{const db=await dbFixture();try{await now(db,'2026-11-09T12:00:00+03:00');const u=await user(db);for(const n of [5,6,7,8,100,1300,2600,999999,1000000]){const locks=await call(db,'lock_targets',[n]);assert.equal(locks.length,5);assert.equal(locks.reduce((a,b)=>a+b,0),n);for(let i=0;i<5;i++){assert(locks[i]>=1);assert(Math.abs(locks[i]-n*[150,200,250,300,400][i]/1300)<1)}}assert.deepEqual(await call(db,'lock_targets',[100]),[12,15,19,23,31]);assert.deepEqual(await call(db,'lock_targets',[2600]),[300,400,500,600,800]);await call(db,'admin',['owner','code',{week,digest}]);await call(db,'admin',['owner','entry',{week,enabled:true}]);await earn(db,u,10);const requestId=uuid(),body={week,requiredKeys:10,requestId};await call(db,'admin',['owner','threshold',body]);await call(db,'admin',['owner','threshold',body]);await assert.rejects(call(db,'admin',['owner','threshold',{...body,requiredKeys:11}]),/request_conflict/);let state=await call(db,'state',[u]);assert.equal(state.threshold,10);assert.deepEqual(state.locks,[1,2,2,2,3]);assert.equal(state.balance,10);assert.equal(state.codeEntry,false);await assert.rejects(call(db,'admin',['owner','threshold',{week,requiredKeys:4,requestId:uuid()}]),/invalid_request/);await assert.rejects(call(db,'code',[u,week,uuid(),digest]),/code_locked/);await call(db,'contribute',[u,week,uuid(),10]);await assert.rejects(call(db,'code',[u,week,uuid(),digest]),/code_locked/);await call(db,'admin',['owner','entry',{week,enabled:true}]);assert.equal((await call(db,'code',[u,week,uuid(),digest])).accepted,true);await call(db,'admin',['owner','threshold',body]);await assert.rejects(call(db,'admin',['owner','threshold',{week,requiredKeys:20,requestId:uuid()}]),/season_locked/);const admin=await call(db,'admin',['owner','state',{week}]);assert.equal(admin.seasons.find(s=>s.week===week).required_keys,10);await now(db,'2026-11-15T20:00:00+03:00');await call(db,'settle',[week]);state=await call(db,'state',[u]);assert.equal(state.status,'success');assert.equal(state.reward,1500);}finally{await db.close()}});

test('next vault saves the pool, cap and proportional goal together before launch', {timeout:30000}, async () => {
 const db=await dbFixture();
 try {
  await db.exec(await readFile(new URL('../supabase/migrations/20261112153056_vault_prepare_next.sql',import.meta.url),'utf8'));
  await now(db,'2026-11-12T12:00:00+03:00');
  const read=async target=>(await db.query('select pool,key_cap,required_keys from rewards_vault_seasons where week=$1',[target])).rows[0];
  const current=await read(week);
  const upcoming={week:'2026-11-16',pool:1800,cap:72,requiredKeys:2600,requestId:uuid()};
  await assert.rejects(call(db,'prepare_next',['viewer',upcoming]),/admin_required/);
  await assert.rejects(call(db,'prepare_next',['owner',{...upcoming,week}]),/season_locked/);
  await assert.rejects(call(db,'prepare_next',['owner',upcoming]),/insufficient_funds/);
  assert.equal((await read(upcoming.week)).required_keys,1300);
  await call(db,'admin',['owner','topup',{amount:2000,requestId:uuid()}]);
  assert.deepEqual(await call(db,'prepare_next',['owner',upcoming]),{ok:true});
  assert.deepEqual(await read(upcoming.week),{pool:1800,key_cap:72,required_keys:2600});
  assert.deepEqual(await call(db,'lock_targets',[2600]),[300,400,500,600,800]);
  assert.deepEqual(await read(week),current);
  const reserved=await call(db,'available');
  await call(db,'prepare_next',['owner',upcoming]);
  assert.equal(await call(db,'available'),reserved);
  await assert.rejects(call(db,'prepare_next',['owner',{...upcoming,cap:73}]),/request_conflict/);
  await now(db,'2026-11-16T00:00:00+03:00');
  await assert.rejects(call(db,'prepare_next',['owner',{...upcoming,requestId:uuid()}]),/season_locked/);
 } finally { await db.close(); }
});

test('owner promo rewards are atomic and restricted to their intended products',{timeout:30000},async()=>{
 const db=await dbFixture();
 try{
  await db.exec(`
   alter table rewards_users add column twitch_user_id text unique, add column created_at timestamptz default now(),
     add column participation_restricted boolean default false;
   alter table rewards_promo_codes alter column id set default gen_random_uuid(), add column reward_type text not null,
     add column coin_amount integer, add column prize_id uuid, add column max_activations integer default 5,
     add column activation_count integer default 0, add column active boolean default true,
     add column archived_at timestamptz, add column expires_at timestamptz, add column created_at timestamptz default now(),
     add column new_users_only boolean default false,
     add constraint rewards_promo_codes_reward_type_check check(reward_type in ('coins','prize')),
     add constraint rewards_promo_reward_valid check(true);
   alter table rewards_promo_redemptions add column reward_type text, add column coin_amount integer,
     add column prize_id uuid, add column win_id uuid, alter column created_at set default now(),
     add unique(promo_id,user_id);
   alter table rewards_wins alter column id set default gen_random_uuid(), add column prize_id uuid,
     add column delivery_status text, add column choice_status text, add column choice_at timestamptz,
     add column item_wear text, add column item_variant_kind text, add column source_type text;
   create table rewards_prizes(id uuid primary key default gen_random_uuid(), name text, image_url text,
     status text, unlimited boolean, draw_weight integer, sell_price_coins integer);
   create table rewards_shop_items(id uuid primary key default gen_random_uuid(),name text,image_url text,status text,stock int,price_coins int);
   create table rewards_shop_item_variants(id uuid primary key default gen_random_uuid(),shop_item_id uuid,
     variant_kind text,wear text,price_coins int,available boolean);
   grant select,insert,update on rewards_prizes,rewards_shop_items,rewards_shop_item_variants to service_role;
   create unique index fixture_owner_promo_active on rewards_promo_codes(lower(code)) where active;
   insert into rewards_users(id,twitch_user_id) values(gen_random_uuid(),'alice'),(gen_random_uuid(),'bob');
   insert into rewards_shop_items(name,image_url,status,price_coins)
     select 'Skin '||price,'https://test/skin','available',price from unnest(array[7,15,25,50,100]) price;
   insert into rewards_shop_item_variants(shop_item_id,variant_kind,wear,price_coins,available)
     select id,'normal','FT',price_coins,true from rewards_shop_items where price_coins<>7;
   insert into rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
     values('Promo skin','https://test/skin','available',true,1,50);
   insert into rewards_promo_codes(code,reward_type,coin_amount) values('COINS','coins',30);
   insert into rewards_promo_codes(code,reward_type,prize_id) select 'SKIN','prize',id from rewards_prizes;
  `);
  for(const file of [
   '20261115150000_major_pickem.sql','20261115160000_major_pickem_medals.sql',
   '20261115092000_three_doors.sql','20261115100000_three_doors_prize_pricing.sql',
   '20261115103000_pick.sql','20261115113500_pick_prize_preview.sql','20261115190717_promo_reward_types.sql',
  ])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  await db.exec(`
   update rewards_major_pickem_stages set open_at=now()-interval '1 hour',lock_at=now()+interval '1 hour',
     first_match_at=now()+interval '2 hours' where stage=1;
   insert into rewards_promo_codes(code,reward_type,reward_amount) values
     ('MAJOR','major_pass',null),('MAJOR2','major_pass',null),('KEYS','vault_keys',4),
     ('OVER','vault_keys',50),('DOORS','three_doors_pass',50),('PICK','pick_credit',70);
   insert into rewards_promo_codes(code,reward_type,prize_id) select 'UPGRADE','upgrade_skin',id from rewards_prizes;
  `);
  await now(db,'2026-11-09T12:00:00+03:00');
  const fn=async(name,...args)=>(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args)).rows[0].result;
  const redeem=(code,actor='alice')=>fn('rewards_redeem_owner_promo',actor,code);
  const stats=async()=> (await db.query("select code,activation_count from rewards_promo_codes where code in ('MAJOR2','OVER','COINS') order by code")).rows;
  assert.equal((await redeem('MAJOR')).rewardType,'major_pass');
  const major=await fn('rewards_major_pickem','alice','state',null,null);
  assert.equal(major.entered,true);assert.equal(major.medal,1);assert.equal(major.balance,0);
  await assert.rejects(redeem('MAJOR2'),/major_already_active/);
  assert.equal((await redeem('KEYS')).amount,4);
  await assert.rejects(redeem('OVER'),/vault_key_limit/);
  const direct=(await db.query("select kind,amount from rewards_vault_key_ledger order by id")).rows;
  assert.deepEqual(direct,[{kind:'promo_grant',amount:4}]);
  assert.equal((await db.query("select reason from rewards_vault_sources")).rows[0].reason,'direct_grant');
  assert.equal((await fn('rewards_vault_state',(await db.query("select id from rewards_users where twitch_user_id='alice'")).rows[0].id)).balance,4);
  assert.equal((await redeem('UPGRADE')).rewardType,'upgrade_skin');
  await assert.rejects(db.exec("update rewards_wins set choice_status='sold' where source_type='promo_upgrade'"),/upgrade_only/);
  await assert.rejects(db.exec("update rewards_wins set delivery_status='received' where source_type='promo_upgrade'"),/upgrade_only/);
  await db.exec("update rewards_wins set choice_status='upgraded',choice_at=now() where source_type='promo_upgrade'");
  await redeem('DOORS');
  const doors=uuid();
  const enterDoors=(id,stake=50)=>fn('rewards_three_doors','alice','start_v2',id,stake,null);
  await assert.rejects(enterDoors(uuid(),100),/insufficient_coins/);
  assert.equal((await enterDoors(doors)).balance,0);
  assert.deepEqual((await enterDoors(doors)).promoStakes,{});
  await redeem('PICK');
  const firstPick=uuid();
  const pick=(action,id,value)=>fn('rewards_pick','alice',action,id,value);
  assert.equal((await pick('start',firstPick,7)).promoBalance,20);
  assert.equal((await pick('start',firstPick,7)).balance,0);
  await pick('reveal',firstPick,1);
  await assert.rejects(pick('start',uuid(),7),/insufficient_coins/);
  assert.equal((await pick('state',null,null)).promoBalance,20);
  const coins=await Promise.allSettled([redeem('coins'),redeem('COINS')]);
  assert.equal(coins.filter(result=>result.status==='fulfilled').length,1);
  assert.match(coins.find(result=>result.status==='rejected').reason.message,/already_used/);
  assert.equal((await pick('start',uuid(),7)).balance,0);
  assert.equal((await pick('state',null,null)).promoBalance,0);
  assert.equal((await redeem('SKIN')).rewardType,'prize');
  assert.deepEqual(await stats(),[{code:'COINS',activation_count:1},{code:'MAJOR2',activation_count:0},{code:'OVER',activation_count:0}]);
  await db.exec('reset role; set role authenticated');
  await assert.rejects(redeem('COINS','bob'),/permission denied/);
  await assert.rejects(db.exec('select * from rewards_promo_game_credits'),/permission denied/);
 }finally{await db.close()}
});
