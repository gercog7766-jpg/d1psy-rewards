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
   create table rewards_shop_items(id uuid primary key default gen_random_uuid(),name text,image_url text,price_coins int not null default 1,status text,stock int);
   create table rewards_shop_item_variants(shop_item_id uuid references rewards_shop_items(id),available boolean,wear text,variant_kind text default 'normal',price_coins int);
   create table rewards_prizes(id uuid primary key default gen_random_uuid(),name text,image_url text,status text,unlimited boolean,draw_weight int,sell_price_coins int);
   create table rewards_wins(id uuid primary key default gen_random_uuid(),user_id uuid,prize_id uuid,won_at timestamptz,delivery_status text,choice_status text,source_type text,item_wear text,item_variant_kind text);
   insert into rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
   select name||case when name='XM1014 | Ирэдзуми' then ' BS' else ' FT' end,'https://example.com/drop.png','available',true,1,1 from unnest(array[
    'AK-47 | Оливковый поликамуфляж','P250 | Ледяная корка',
    'SCAR-20 | Песчаная сетка','M249 | Ледяная корка',
    'XM1014 | Ирэдзуми','MAC-10 | Световой короб']) as name;
   insert into rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
   select name,'https://example.com/drop.png','available',true,1,1 from unnest(array[
    'Five-SeveN | Небесная голубизна FT','SG 553 | Корзинные полутона FT',
    'Негев | Кислый виноград BS','ПП-19 «Бизон» | Карамельное яблоко FT']) as name;
   create function rewards_crypto_index(n integer) returns integer language sql as 'select 0';
   insert into rewards_users(twitch_user_id) values('alice'),('bob');
   insert into rewards_major_pickem_entries(user_id,tokens) select id,2 from rewards_users where twitch_user_id='alice';
   insert into rewards_shop_items(name,image_url,status)
   select name,'https://example.com/skin.png','available' from unnest(array[
     'AK-47 | Оливковый поликамуфляж','Five-SeveN | Небесная голубизна',
     'P250 | Ледяная корка','SG 553 | Корзинные полутона',
     'SCAR-20 | Песчаная сетка','M249 | Ледяная корка',
     'Негев | Кислый виноград','XM1014 | Ирэдзуми',
     'ПП-19 «Бизон» | Карамельное яблоко','MAC-10 | Световой короб',
     'Five-SeveN | Капилляры','CZ75-Auto | Эко']) as name;
   insert into rewards_shop_item_variants(shop_item_id,available,wear,variant_kind,price_coins)
    select id,true,'FT','normal',7 from rewards_shop_items where name in ('Five-SeveN | Капилляры','CZ75-Auto | Эко');
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261118143000_major_bronze_case.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261118151000_major_bronze_drop_prizes.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261118154500_major_bronze_drop_remaining.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261120200000_major_bronze_artwork.sql',import.meta.url),'utf8'));
  await db.exec("update rewards_prizes set image_url='https://example.com/'||md5(name)||'.png';update rewards_shop_items set image_url='https://example.com/'||md5(name)||'.png'");
  const catalog=(await db.query('select rewards_major_bronze_catalog() as catalog')).rows[0].catalog;
  assert.equal(catalog.length,12);assert.equal(new Set(catalog.map(x=>x.image)).size,12);assert(catalog.every(x=>Object.keys(x).sort().join(',')==='image,name'));
  const request='00000000-0000-4000-8000-000000000001';
  const open=async(who,id)=>(await db.query('select rewards_major_bronze_open($1,$2) as result',[who,id])).rows[0].result;
  await db.exec("update rewards_shop_items set image_url=null where name='CZ75-Auto | Эко'");
  await assert.rejects(open('alice',request),/case_catalog_incomplete/);
  assert.equal((await db.query('select tokens from rewards_major_pickem_entries')).rows[0].tokens,2);
  await db.exec("update rewards_shop_items set image_url='https://example.com/'||md5(name)||'.png' where name='CZ75-Auto | Эко'");
  const first=await open('alice',request);
  assert.equal(first.tokens,1);assert.equal(first.name,'AK-47 | Оливковый поликамуфляж');assert.equal(first.wear,null);
  assert.deepEqual(first.catalog,catalog);assert.equal(first.image,catalog[0].image);
  const second=await open('alice',request);
  assert.equal(second.replayed,true);assert.equal(second.winId,first.winId);assert.equal(second.tokens,1);
  const count=await db.query('select count(*)::int as n from rewards_wins');
  assert.equal(count.rows[0].n,1);
  await assert.rejects(open('bob','00000000-0000-4000-8000-000000000002'),/entry_required/);
  await db.exec("update rewards_shop_item_variants set available=false");
  await assert.rejects(open('alice','00000000-0000-4000-8000-000000000003'),/case_catalog_incomplete/);
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

  const {rows:[entry]}=await db.query("select tokens from rewards_major_pickem_entries where user_id=(select id from rewards_users where twitch_user_id='alice')");
  assert.equal(entry.tokens,0);
  // Historic and future token purchases are upgradeable without becoming saleable.
  await db.exec(`
   alter table rewards_wins add column delivered_at timestamptz,add column choice_at timestamptz,add column sold_for_coins int,add column round_id uuid;
   alter table rewards_prizes add column created_at timestamptz default now();
   alter table rewards_shop_item_variants add column id uuid default gen_random_uuid();
   create table rewards_coin_transactions(user_id uuid,amount int,transaction_type text,win_id uuid,note text);
   create table rewards_upgrades(id uuid primary key default gen_random_uuid(),user_id uuid,source_win_id uuid,target_shop_item_id uuid,target_shop_variant_id uuid,source_value_coins int,target_value_coins int,chance_bps int,roll_bps int,result text,source_name text,target_name text,extra_coins int,reward_win_id uuid);
   update rewards_shop_item_variants set available=true;
   update rewards_prizes set sell_price_coins=12 where name='SG 553 | Киберсила' and status='available';
   insert into rewards_shop_items(name,image_url,status) values('Upgrade target','https://example.com/target.png','available');
   insert into rewards_shop_item_variants(shop_item_id,available,wear,variant_kind,price_coins) select id,true,'FT','normal',100 from rewards_shop_items where name='Upgrade target';
  `);
  const newer=await readFile(new URL('../supabase/migrations/20261118213000_major_rewards_standard_inventory.sql',import.meta.url),'utf8');
  await db.exec(newer.slice(newer.indexOf('create or replace function public.rewards_major_shop_buy'),newer.indexOf("NOTIFY pgrst")));
  const sell=await readFile(new URL('../supabase/migrations/20261108114703_referrals_qualified_rewards_v2.sql',import.meta.url),'utf8');
  await db.exec(sell.slice(sell.indexOf('create or replace function public.rewards_sell_win'),sell.indexOf('create function public.rewards_referral_same_steam')));
  await db.exec(await readFile(new URL('../supabase/migrations/20261120210000_major_shop_upgrade_values.sql',import.meta.url),'utf8'));
  const value=async win=>(await db.query('select p.sell_price_coins,p.upgrade_value_coins from rewards_prizes p join rewards_wins w on w.prize_id=p.id where w.id=$1',[win])).rows[0];
  assert.deepEqual(await value(purchased.winId),{sell_price_coins:0,upgrade_value_coins:12});
  assert.equal((await value(first.winId)).upgrade_value_coins,null,'case rewards unchanged');
  const alice=(await db.query("select id from rewards_users where twitch_user_id='alice'")).rows[0].id;
  await assert.rejects(db.query('select rewards_sell_win($1,$2)',[purchased.winId,alice]),/sale_price_not_set/);
  await db.exec('update rewards_major_pickem_entries set tokens=10');
  const sticker=await buy('alice','00000000-0000-4000-8000-000000000006',4);
  assert.deepEqual(await value(sticker.winId),{sell_price_coins:0,upgrade_value_coins:5});
  await assert.rejects(db.query('select rewards_sell_win($1,$2)',[sticker.winId,alice]),/sale_price_not_set/);
  const target=(await db.query("select v.id,v.shop_item_id from rewards_shop_item_variants v join rewards_shop_items i on i.id=v.shop_item_id where i.name='Upgrade target'")).rows[0];
  const single=(await db.query('select * from rewards_run_skin_upgrade($1,$2,$3,$4,0)',[alice,purchased.winId,target.shop_item_id,target.id])).rows[0];
  assert.equal(single.chance_bps,1080);
  const multi=(await db.query('select * from rewards_run_skin_upgrade_multi($1,$2,$3,$4,0)',[alice,[sticker.winId],[target.shop_item_id],[target.id]])).rows[0];
  assert.equal(multi.chance_bps,450);
  assert.equal((await db.query('select count(*)::int n from rewards_coin_transactions where transaction_type=\'win_sale\'')).rows[0].n,0);
 }finally{await db.close();}
});
