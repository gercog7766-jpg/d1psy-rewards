import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const migration=await readFile(new URL('../supabase/migrations/20261106020516_contracts_inventory.sql',import.meta.url),'utf8');
test('contracts: atomic inventory exchange, ownership, replay, stale items, rollback, private RPC and no wallet writes',async()=>{
 const db=new PGlite(),u=randomUUID(),other=randomUUID(),prize=randomUUID(),shop=randomUUID(),variant=randomUUID();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table rewards_users(id uuid primary key);
 create table rewards_prizes(id uuid primary key default gen_random_uuid(),name text not null,image_url text,status text,unlimited boolean,draw_weight int,sell_price_coins int);
 create table rewards_wins(id uuid primary key default gen_random_uuid(),round_id uuid,user_id uuid references rewards_users(id),prize_id uuid references rewards_prizes(id),delivery_status text,choice_status text constraint rewards_wins_choice_status_check check(choice_status in ('awaiting_choice','claimed','sold','upgraded')),choice_at timestamptz,item_wear text,item_variant_kind text,source_type text);
 create table rewards_shop_items(id uuid primary key,name text,image_url text,status text,stock int);
 create table rewards_shop_item_variants(id uuid primary key,shop_item_id uuid references rewards_shop_items(id),price_coins int,wear text,variant_kind text,available boolean);
 create table rewards_coin_transactions(user_id uuid,amount int);
 grant select,insert,update on all tables in schema public to service_role;`);
 await db.query('insert into rewards_users values($1),($2)',[u,other]);
 await db.query("insert into rewards_prizes values($1,'Source','/source.png','disabled',true,1,100)",[prize]);
 await db.query("insert into rewards_shop_items values($1,'AK-47 | Test','/test.png','available',null)",[shop]);
 await db.query("insert into rewards_shop_item_variants values($1,$2,300,'FT','stattrak',true)",[variant,shop]);
 await db.query('insert into rewards_coin_transactions values($1,123)',[u]);
 await db.exec(migration);
 await db.exec(await readFile(new URL('../supabase/migrations/20261106024833_contracts_five_tier_odds.sql',import.meta.url),'utf8'));
 for(const price of [150,210,390,540])await db.query("insert into rewards_shop_item_variants values($1,$2,$3,'FT','stattrak',true)",[randomUUID(),shop,price]);
 const expected=[[40,60,15],[61,80,25],[81,105,30],[106,150,20],[151,200,10]];
 const counts=new Map();
 for(let roll=0;roll<100;roll++){const b=(await db.query('select rewards_contract_bounds($1) b',[roll])).rows[0].b;const k=b.join('-');counts.set(k,(counts.get(k)||0)+1)}
 assert.deepEqual([...counts],expected.map(([lo,hi,n])=>[lo+'-'+hi,n]));
 await assert.rejects(db.query('select rewards_contract_bounds(-1)'),/invalid_roll/);await assert.rejects(db.query('select rewards_contract_bounds(100)'),/invalid_roll/);
 const sources=async(owner=u,status='awaiting_choice',delivery='awaiting_choice')=>{const ids=[randomUUID(),randomUUID(),randomUUID()];for(const id of ids)await db.query('insert into rewards_wins(id,user_id,prize_id,choice_status,delivery_status) values($1,$2,$3,$4,$5)',[id,owner,prize,status,delivery]);return ids};
 const run=async(ids,key=randomUUID(),user=u)=>(await db.query('select rewards_run_contract($1,$2,$3) result',[user,ids,key])).rows[0].result;
 let ids=await sources(),key=randomUUID();await db.exec('set role service_role');
 const [a,b]=await Promise.all([run(ids,key),run([...ids].reverse(),key)]);assert.deepEqual(a,b);assert([150,210,300,390,540].includes(a.reward.price));assert.equal(a.reward.kind,'stattrak');assert.equal(a.reward.wear,'FT');assert.equal(a.reward.name,'StatTrak™ AK-47 | Test');
 assert.equal((await db.query("select count(*)::int n from rewards_wins where choice_status='contracted'")).rows[0].n,3);
 assert.equal((await db.query("select count(*)::int n from rewards_wins where source_type='contract' and choice_status='awaiting_choice'")).rows[0].n,1);
 await assert.rejects(run(ids),/source_not_available/);
 await assert.rejects(run([ids[0],ids[0],ids[1]]),/invalid_request/);
 await assert.rejects(run(ids.slice(0,2)),/invalid_request/);
 await assert.rejects(run(Array(11).fill(ids[0])),/invalid_request/);
 await assert.rejects(run([ids[0],ids[1],null]),/invalid_request/);
 await assert.rejects(run(ids,randomUUID(),other),/source_not_available/);
 const fresh=await sources();await assert.rejects(run(fresh,key),/request_conflict/);
 for(const [status,delivery] of [['sold','pending'],['claimed','pending'],['upgraded','pending'],['awaiting_choice','received']]){const stale=await sources(u,status,delivery);await assert.rejects(run(stale),/source_not_available/)}
 const alien=await sources(other);await assert.rejects(run([fresh[0],fresh[1],alien[0]]),/source_not_available/);
 await db.exec('reset role');await db.query('update rewards_shop_item_variants set available=false where price_coins=150');await db.exec('set role service_role');await assert.rejects(run(fresh),/no_contract_result/);
 assert.equal((await db.query('select count(*)::int n from rewards_contracts')).rows[0].n,1);assert.equal((await db.query("select count(*)::int n from rewards_wins where id=any($1) and choice_status='awaiting_choice'",[fresh])).rows[0].n,3);
 // A populated middle tier cannot silently replace a missing low tier.
 assert.equal((await db.query('select count(*)::int n from rewards_shop_item_variants where available')).rows[0].n,4);
 // Failure after consumption and prize insertion must roll back the whole exchange.
 await db.exec('reset role; update rewards_shop_item_variants set available=true;');
 await db.exec("create function fail_contract() returns trigger language plpgsql as $$begin raise exception 'forced_failure'; end$$;create trigger fail_contract before insert on rewards_contracts for each row execute function fail_contract();set role service_role;");
 const before=(await db.query('select count(*)::int n from rewards_prizes')).rows[0].n;await assert.rejects(run(fresh),/forced_failure/);assert.equal((await db.query('select count(*)::int n from rewards_prizes')).rows[0].n,before);
 assert.equal((await db.query("select count(*)::int n from rewards_wins where id=any($1) and choice_status='awaiting_choice'",[fresh])).rows[0].n,3);
 assert.equal((await db.query('select sum(amount)::int n from rewards_coin_transactions')).rows[0].n,123);
 await db.exec('reset role;drop trigger fail_contract on rewards_contracts;set role service_role;');
 for(let i=0;i<40;i++){const input=await sources(),result=await run(input);const pct=(await db.query('select rolled_percent p from rewards_contracts where id=$1',[result.contractId])).rows[0].p;const [lo,hi]=expected.find(([lo,hi])=>pct>=lo&&pct<=hi);assert(result.reward.price*100>=300*lo&&result.reward.price*100<=300*hi,'actual reward stays in the drawn tier')}
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(run(fresh),/permission denied/);await assert.rejects(db.query('select rewards_contract_bounds(0)'),/permission denied/);await assert.rejects(db.query('select * from rewards_contracts'),/permission denied/)}
 }finally{await db.close()}
});
