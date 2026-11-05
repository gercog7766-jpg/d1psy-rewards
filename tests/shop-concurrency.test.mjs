import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFile} from 'node:fs/promises';

// Disposable PostgreSQL only; never connects to production.
const connectionString=process.env.DATABASE_URL;
test('two different shop items cannot overspend same user', {skip:process.env.VERIFY_SHOP_CONCURRENCY!=='true'}, async()=>{
 const dbName=new URL(connectionString).pathname.slice(1);
 assert.equal(dbName,'d1psy_multistream_test_db');
 const pool=new pg.Pool({connectionString,max:4});
 const user='11111111-1111-4111-8111-111111111111';
 const itemA='22222222-2222-4222-8222-222222222222';
 const itemB='33333333-3333-4333-8333-333333333333';
 const variant='44444444-4444-4444-8444-444444444444';
 const setup=await pool.connect();
 try{
  await setup.query('BEGIN');
  await setup.query(`CREATE SCHEMA IF NOT EXISTS shop_concurrency_fixture`);
  // Create fixture tables in public inside a transaction so the test leaves no data or schema behind.
  await setup.query(`CREATE TABLE IF NOT EXISTS public.rewards_users(id uuid PRIMARY KEY)`);
  await setup.query(`CREATE TABLE IF NOT EXISTS public.rewards_shop_items(id uuid PRIMARY KEY,name text,image_url text,price_coins integer,stock integer,status text,updated_at timestamptz)`);
  await setup.query(`CREATE TABLE IF NOT EXISTS public.rewards_shop_item_variants(id uuid PRIMARY KEY,shop_item_id uuid,price_coins integer,available boolean,variant_kind text,wear text)`);
  await setup.query(`CREATE TABLE IF NOT EXISTS public.rewards_coin_transactions(id bigserial PRIMARY KEY,user_id uuid,amount integer,transaction_type text,note text,created_at timestamptz DEFAULT now())`);
  await setup.query(`CREATE TABLE IF NOT EXISTS public.rewards_prizes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,image_url text,status text,unlimited boolean,draw_weight integer,sell_price_coins integer,created_at timestamptz DEFAULT now())`);
  await setup.query(`CREATE TABLE IF NOT EXISTS public.rewards_wins(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),round_id uuid,user_id uuid,prize_id uuid,delivery_status text,choice_status text,won_at timestamptz,source_type text,item_wear text,item_variant_kind text)`);
  await setup.query('INSERT INTO public.rewards_users(id) VALUES($1) ON CONFLICT DO NOTHING',[user]);
  await setup.query(`INSERT INTO public.rewards_shop_items(id,name,image_url,price_coins,stock,status) VALUES($1,'A','',80,10,'available'),($2,'B','',80,10,'available') ON CONFLICT DO NOTHING`,[itemA,itemB]);
  await setup.query(`INSERT INTO public.rewards_shop_item_variants(id,shop_item_id,price_coins,available,variant_kind,wear) VALUES($1,$2,80,true,'normal','FT') ON CONFLICT DO NOTHING`,[variant,itemB]);
  await setup.query(`INSERT INTO public.rewards_coin_transactions(user_id,amount,transaction_type,note) VALUES($1,100,'adjustment','test')`,[user]);
  const sql=await readFile(new URL('../migrations/20261104_shop_purchase_user_lock_proposal.sql',import.meta.url),'utf8');
  await setup.query(sql);
  // Savepoint release isn't enough: concurrent transactions must see committed setup.
  await setup.query('COMMIT');
  const attempts=await Promise.allSettled([
   pool.query('SELECT public.rewards_purchase_shop_item($1,$2)',[itemA,user]),
   pool.query('SELECT public.rewards_purchase_shop_item_variant($1,$2,$3)',[itemB,variant,user])
  ]);
  assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(attempts.filter(x=>x.status==='rejected'&&String(x.reason.message).includes('insufficient_coins')).length,1);
  const balance=await pool.query('SELECT sum(amount)::integer AS balance,count(*) FILTER (WHERE amount<0)::integer AS debits FROM public.rewards_coin_transactions WHERE user_id=$1',[user]);
  assert.equal(balance.rows[0].balance,20);
  assert.equal(balance.rows[0].debits,1);
  const wins=await pool.query('SELECT count(*)::integer AS n FROM public.rewards_wins WHERE user_id=$1',[user]);
  assert.equal(wins.rows[0].n,1);
  const stock=await pool.query('SELECT sum(stock)::integer AS total FROM public.rewards_shop_items WHERE id=ANY($1::uuid[])',[[itemA,itemB]]);
  assert.equal(stock.rows[0].total,19);
 }finally{
  await setup.query('ROLLBACK').catch(()=>{});
  setup.release();
  await pool.end();
 }
});
