import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

test('bronze case atomically debits tokens, grants a win and replays request IDs',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create role anon;create role authenticated;create role service_role bypassrls;
   create table rewards_users(id uuid primary key default gen_random_uuid(),twitch_user_id text unique,banned boolean default false,participation_restricted boolean default false);
   create table rewards_major_pickem_entries(user_id uuid primary key references rewards_users(id),tokens int not null check(tokens>=0));
   create table rewards_shop_items(id uuid primary key default gen_random_uuid(),name text,image_url text,status text,stock int);
   create table rewards_shop_item_variants(shop_item_id uuid references rewards_shop_items(id),available boolean,wear text,variant_kind text,price_coins int);
   create table rewards_prizes(id uuid primary key default gen_random_uuid(),name text,image_url text,status text,unlimited boolean,draw_weight int,sell_price_coins int);
   create table rewards_wins(id uuid primary key default gen_random_uuid(),user_id uuid,prize_id uuid,won_at timestamptz,delivery_status text,choice_status text,source_type text,item_wear text,item_variant_kind text);
   create function rewards_crypto_index(n integer) returns integer language sql as 'select 0';
   insert into rewards_users(twitch_user_id) values('alice'),('bob');
   insert into rewards_major_pickem_entries(user_id,tokens) select id,2 from rewards_users where twitch_user_id='alice';
   insert into rewards_shop_items(name,image_url,status) values('AK-47 | Оливковый поликамуфляж','https://example.com/ak.png','available');
   insert into rewards_shop_item_variants(shop_item_id,available,wear,variant_kind,price_coins)
    select id,true,'FT','wear',7 from rewards_shop_items;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261118143000_major_bronze_case.sql',import.meta.url),'utf8'));
  const request='00000000-0000-4000-8000-000000000001';
  const open=async(who,id)=>(await db.query('select rewards_major_bronze_open($1,$2) as result',[who,id])).rows[0].result;
  const first=await open('alice',request);
  assert.equal(first.tokens,1);assert.equal(first.name,'AK-47 | Оливковый поликамуфляж');
  const second=await open('alice',request);
  assert.equal(second.replayed,true);assert.equal(second.winId,first.winId);assert.equal(second.tokens,1);
  const count=await db.query('select count(*)::int as n from rewards_wins');
  assert.equal(count.rows[0].n,1);
  await assert.rejects(open('bob','00000000-0000-4000-8000-000000000002'),/entry_required/);
  await db.exec(`insert into rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
    values('SG 553 | Киберсила','https://example.com/sg.png','available',true,1,1)`);
  const buy=async(who,id,item)=>(await db.query('select rewards_major_shop_buy($1,$2,$3) as result',[who,id,item])).rows[0].result;
  const shopId='00000000-0000-4000-8000-000000000004';
  const purchased=await buy('alice',shopId,0);
  assert.equal(purchased.tokens,0);assert.equal(purchased.name,'SG 553 | Киберсила');
  const replay=await buy('alice',shopId,0);
  assert.equal(replay.winId,purchased.winId);assert.equal(replay.tokens,0);
  await assert.rejects(buy('alice',shopId,1),/invalid_request/);
  await assert.rejects(buy('alice','00000000-0000-4000-8000-000000000005',0),/insufficient_tokens/);
  await db.exec("update rewards_shop_item_variants set available=false");
  await assert.rejects(open('alice','00000000-0000-4000-8000-000000000003'),/case_prize_unavailable/);
  const {rows:[entry]}=await db.query("select tokens from rewards_major_pickem_entries where user_id=(select id from rewards_users where twitch_user_id='alice')");
  assert.equal(entry.tokens,0);
 }finally{await db.close();}
});
