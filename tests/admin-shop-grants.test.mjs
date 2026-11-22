import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

test('admin shop grants preserve variant, price and recipient and are atomic and idempotent',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create table rewards_admins(twitch_user_id text primary key);
  create table rewards_users(id uuid primary key);
  create table rewards_shop_items(id uuid primary key,name text,image_url text,price_coins int,status text,stock int);
  create table rewards_shop_item_variants(id uuid primary key,shop_item_id uuid,wear text,variant_kind text,price_coins int,available boolean);
  create table rewards_prizes(id uuid primary key default gen_random_uuid(),name text,image_url text,status text,unlimited boolean,draw_weight int,sell_price_coins int);
  create table rewards_wins(id uuid primary key default gen_random_uuid(),user_id uuid,prize_id uuid,won_at timestamptz,delivery_status text,choice_status text,item_wear text,item_variant_kind text);
  grant select,insert on all tables in schema public to service_role;
  insert into rewards_admins values('owner');`);
  const user=randomUUID(),item=randomUUID(),variant=randomUUID(),fixed=randomUUID(),request=randomUUID();
  await db.query('insert into rewards_users values($1)',[user]);
  await db.query("insert into rewards_shop_items values($1,'AK-47 | Test','image',5,'available',null),($2,'Fixed','image',20,'available',null)",[item,fixed]);
  await db.query("insert into rewards_shop_item_variants values($1,$2,'FT','stattrak',125,true)",[variant,item]);
  await db.exec(await readFile(new URL('../supabase/migrations/20261122160000_admin_shop_grants.sql',import.meta.url),'utf8'));
  await db.exec('set role service_role');
  const grant=(actor,i,v,r)=>db.query('select rewards_admin_grant_shop_skin($1,$2,$3,$4,$5) as result',[actor,user,i,v,r]);
  const a=await grant('owner',item,variant,request),b=await grant('owner',item,variant,request);
  assert.deepEqual(a.rows,b.rows);
  await assert.rejects(grant('owner',item,null,randomUUID()),/variant_required/);
  await assert.rejects(grant('owner',fixed,variant,randomUUID()),/variant_not_available/);
  await assert.rejects(grant('other',item,variant,randomUUID()),/admin_required/);
  const {rows}=await db.query('select w.user_id,w.item_wear,w.item_variant_kind,w.delivery_status,p.sell_price_coins,p.status from rewards_wins w join rewards_prizes p on p.id=w.prize_id');
  assert.deepEqual(rows,[{user_id:user,item_wear:'FT',item_variant_kind:'stattrak',delivery_status:'awaiting_choice',sell_price_coins:125,status:'disabled'}]);
  await grant('owner',fixed,null,randomUUID());
  await db.exec('reset role; set role anon');
  await assert.rejects(grant('owner',item,variant,randomUUID()),/permission denied/);
 }finally{await db.close()}
});
