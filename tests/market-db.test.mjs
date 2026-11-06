import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
test('market: exact variants, private ownership, legacy favorites, live prices, goal cascade and no coin writes',async()=>{
 const db=new PGlite();const u=randomUUID(),other=randomUUID(),skin=randomUUID(),fixed=randomUUID(),hidden=randomUUID(),ft=randomUUID(),st=randomUUID(),fn=randomUUID();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table public.rewards_users(id uuid primary key);
 create table public.rewards_shop_items(id uuid primary key,name text,image_url text,price_coins integer,status text,stock integer);
 create table public.rewards_shop_item_variants(id uuid primary key,shop_item_id uuid references public.rewards_shop_items(id) on delete cascade,wear text,variant_kind text,price_coins integer,available boolean);
 create table public.rewards_coin_transactions(user_id uuid,amount integer);
 create table public.rewards_shop_favorites(user_id uuid,shop_item_id uuid,created_at timestamptz default now(),primary key(user_id,shop_item_id));
 grant select on all tables in schema public to service_role;`);
 await db.query('insert into public.rewards_users values($1),($2)',[u,other]);
 await db.query("insert into public.rewards_shop_items values($1,'AK-47 | Example','img',90,'available',null),($2,'Sticker','sticker',30,'available',null),($3,'Hidden','hidden',500,'hidden',null)",[skin,fixed,hidden]);
 await db.query("insert into public.rewards_shop_item_variants values($1,$4,'FT','normal',100,true),($2,$4,'FN','stattrak',200,true),($3,$4,'FN','normal',150,false)",[ft,st,fn,skin]);
 await db.query('insert into public.rewards_shop_favorites(user_id,shop_item_id) values($1,$2),($1,$3)',[u,skin,fixed]);
 await db.query('insert into public.rewards_coin_transactions values($1,80),($2,300)',[u,other]);
 await db.exec(await readFile(new URL('../supabase/migrations/20261106002813_market_favorites_goals.sql',import.meta.url),'utf8'));
 await db.exec('set role service_role');
 const state=async(user=u)=>(await db.query('select public.rewards_market_state($1) as s',[user])).rows[0].s;
 const set=async(action,item=skin,variant=ft,user=u)=>(await db.query('select public.rewards_market_set($1,$2,$3,$4) as s',[user,action,item,variant])).rows[0].s;
 let s=await state();assert.equal(s.balance,80);assert.equal(s.favorites.length,2);assert(s.favorites.some(x=>x.variantId===ft));assert(s.favorites.some(x=>x.itemId===fixed&&x.variantId===null));assert.equal((await state(other)).favorites.length,0);
 await set('favorite',skin,st);await set('favorite',skin,st);s=await state();assert.equal(s.favorites.length,3);assert.equal(s.favorites.find(x=>x.variantId===st).kind,'stattrak');
 await assert.rejects(set('favorite',fixed,st),/variant_not_found/);await assert.rejects(set('favorite',skin,null),/choose_variant/);await assert.rejects(set('favorite',hidden,null),/item_unavailable/);
 s=await set('goal');const first=s.goalFavoriteId;assert.equal(s.favorites.find(x=>x.id===first).variantId,ft);
 s=await set('goal',skin,st);assert.notEqual(s.goalFavoriteId,first);assert.equal((await db.query('select count(*)::int as n from public.rewards_market_goals where user_id=$1',[u])).rows[0].n,1);
 await db.exec('reset role');await db.query('update public.rewards_shop_item_variants set price_coins=250,available=false where id=$1',[st]);await db.exec('set role service_role');
 s=await state();assert.equal(s.favorites.find(x=>x.id===s.goalFavoriteId).price,250);assert.equal(s.favorites.find(x=>x.id===s.goalFavoriteId).available,false);
 await set('favorite',skin,st,other);const theirs=await set('goal',skin,st,other);
 await assert.rejects(db.query('update public.rewards_market_goals set favorite_id=$1 where user_id=$2',[theirs.goalFavoriteId,u]),/foreign key/);
 await set('unfavorite',skin,st,other);assert.equal((await state()).goalFavoriteId,s.goalFavoriteId);assert.equal((await state(other)).goalFavoriteId,null);
 s=await set('unfavorite',skin,st);assert.equal(s.goalFavoriteId,null);assert.equal(s.favorites.length,2);
 await set('goal',fixed,null);s=await set('clear_goal',null,null);assert.equal(s.goalFavoriteId,null);assert.equal(s.favorites.length,2);
 assert.equal((await db.query('select count(*)::int as n,sum(amount)::int as balance from public.rewards_coin_transactions')).rows[0].n,2);assert.equal((await state()).balance,80);
 await db.exec('reset role');await db.query('insert into public.rewards_coin_transactions select $1,1 from generate_series(1,1001)',[u]);await db.exec('set role service_role');assert.equal((await state()).balance,1081);
 await set('goal',skin,ft);await db.exec('reset role');await db.query('delete from public.rewards_shop_item_variants where id=$1',[ft]);await db.exec('set role service_role');assert.equal((await state()).goalFavoriteId,null);
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(state(),/permission denied/);await assert.rejects(set('favorite',fixed,null),/permission denied/);await assert.rejects(db.query('select * from public.rewards_market_favorites'),/permission denied/)}
 }finally{await db.close()}
});
