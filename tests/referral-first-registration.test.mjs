import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {registerTwitchIdentity} from '../src/twitch-registration.ts';

const folder=new URL('../supabase/migrations/',import.meta.url);
async function fixture(){
 const db=new PGlite();
 await db.exec(String.raw`create role anon;create role authenticated;create role service_role bypassrls;
create table rewards_users(id uuid primary key default gen_random_uuid(),twitch_user_id text unique,created_at timestamptz default now(),updated_at timestamptz default now(),twitch_avatar_url text,twitch_login text,twitch_display_name text,banned boolean default false,steam_trade_url_valid boolean default false,steam_trade_url text);
create table rewards_referrals(referred_user_id uuid primary key references rewards_users,referrer_user_id uuid references rewards_users,created_at timestamptz default now(),qualified_at timestamptz,signup_bonus_paid_at timestamptz,check(referred_user_id<>referrer_user_id));
create table rewards_referral_earnings(id uuid primary key default gen_random_uuid());
create table rewards_round_participants(user_id uuid);
create table rewards_prizes(id uuid primary key default gen_random_uuid(),sell_price_coins int);
create table rewards_wins(id uuid primary key default gen_random_uuid(),user_id uuid,prize_id uuid,round_id uuid,source_type text,choice_status text default 'awaiting_choice',delivery_status text default 'pending',choice_at timestamptz,sold_for_coins int);
create table rewards_coin_transactions(id uuid primary key default gen_random_uuid(),user_id uuid references rewards_users,amount int check(amount<>0),transaction_type text constraint rewards_coin_transactions_transaction_type_check check(transaction_type in('win_sale','adjustment','level_reward','shop_purchase','gift_sent','gift_received')),win_id uuid,note text,created_at timestamptz default now());
create table rewards_upgrades(id uuid primary key default gen_random_uuid(),user_id uuid,result text,source_value_coins int,reward_win_id uuid,extra_coins int default 0);
create table rewards_orders(id uuid primary key default gen_random_uuid(),user_id uuid,win_id uuid,source_type text,price_coins int,status text default 'pending');
create table rewards_streamer_live_profiles(broadcaster_id text,status text);
create table rewards_streamers(twitch_broadcaster_id text,is_primary boolean,enabled boolean);
create table rewards_streamer_live_awards(win_id uuid,round_id uuid);create table rewards_promo_redemptions(user_id uuid,win_id uuid);
create table rewards_contracts(id uuid primary key default gen_random_uuid(),user_id uuid,source_value_coins bigint);
grant select,insert,update on all tables in schema public to service_role;`);
 const parent=randomUUID(),old=randomUUID();
 await db.query("insert into rewards_users(id,twitch_user_id,twitch_login,twitch_display_name,created_at) values($1,'200','parent','Parent',now()-interval '8 days'),($2,'300','old','Old',now()-interval '7 days')",[parent,old]);
 for(const file of ['20261108114703_referrals_qualified_rewards_v2.sql','20261108120305_referral_promo_qualification_and_admin.sql','20261111065406_referral_first_registration_stage.sql']){
  await db.exec(await readFile(new URL(file,folder),'utf8'));
 }
 await db.exec('update rewards_referral_registration_policy set enforce_first_registration=true where id;set role service_role');
 const call=async(name,args=[])=>(await db.query('select '+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') data',args)).rows[0].data;
 const code=await call('rewards_referral_code',[parent]);
 const reg=(id,invite=null)=>call('rewards_register_twitch_identity',[id,'viewer_'+id,'Viewer '+id,null,invite]);
 return {db,parent,old,code,call,reg};
}

test('referral binding is only allowed inside first Twitch registration',async()=>{
 const {db,parent,old,code,call,reg}=await fixture();
 try{
  assert.equal((await call('rewards_referral_bind',[old,code])).status,'existing_user');
  const fresh=await reg('400');assert.equal(fresh.isNew,true);
  assert.equal((await reg('400',code)).referralStatus,'existing_user');
  assert.equal((await call('rewards_referral_bind',[fresh.userId,code])).status,'existing_user');
  const invited=await reg('500',code);
  assert.equal(invited.referralStatus,'bound');
  assert.equal((await db.query('select referrer_user_id from rewards_referrals where referred_user_id=$1',[invited.userId])).rows[0].referrer_user_id,parent);
  assert.equal((await reg('500',code)).isNew,false);
  assert.equal((await db.query('select count(*) n from rewards_referrals where referred_user_id=$1',[invited.userId])).rows[0].n,1);
  await assert.rejects(db.query('insert into rewards_referrals(referred_user_id,referrer_user_id) values($1,$2)',[old,parent]),/existing_user/);
  await assert.rejects(call('rewards_referral_bind_legacy',[old,code]),/existing_user/);
  assert.equal((await db.query('select count(*) n from rewards_referral_registration_permits')).rows[0].n,0);
 }finally{await db.close()}
});

test('existing Twitch identity remains ineligible after deletion/recreation and simultaneous callbacks',async()=>{
 const {db,code,call,reg}=await fixture();
 try{
  const pair=await Promise.all([reg('600',code),reg('600',code)]);
  assert.equal(pair.filter(x=>x.isNew).length,1);
  assert.equal(pair[0].userId,pair[1].userId);
  const first=await reg('700');
  await db.exec('reset role');
  await db.query('delete from rewards_users where id=$1',[first.userId]);
  await db.exec('set role service_role');
  const again=await reg('700',code);
  assert.equal(again.isNew,false);
  assert.equal((await call('rewards_referral_bind',[again.userId,code])).status,'existing_user');
 }finally{await db.close()}
});

test('detachment tombstone blocks reattachment while preserving historical payouts',async()=>{
 const {db,parent,old,code,call}=await fixture();
 try{
  // Emulate an existing historical link in the compatibility phase.
  await db.exec('reset role;update rewards_referral_registration_policy set enforce_first_registration=false where id;set role service_role');
  assert.equal((await call('rewards_referral_bind',[old,code])).status,'bound');
  await db.query('update rewards_users set steam_trade_url_valid=true where id=$1',[old]);
  await db.query("insert into rewards_coin_transactions(user_id,amount,transaction_type,note) values($1,50,'adjustment','Ежедневный бонус · день 4')",[old]);
  await call('rewards_referral_settle',[30]);
  const events=(await db.query('select id,settlement_id from rewards_referral_events')).rows;
  const balances=(await db.query('select user_id,sum(amount)::int n from rewards_coin_transactions group by user_id order by user_id')).rows;
  await db.query("insert into rewards_referral_detachments(referred_user_id,referrer_user_id,reason,snapshot) values($1,$2,'No sanctions','{}')",[old,parent]);
  await db.query('delete from rewards_referrals where referred_user_id=$1',[old]);
  assert.deepEqual((await db.query('select id,settlement_id from rewards_referral_events')).rows,events);
  assert.deepEqual((await db.query('select user_id,sum(amount)::int n from rewards_coin_transactions group by user_id order by user_id')).rows,balances);
  assert.equal((await call('rewards_referral_bind',[old,code])).status,'existing_user');
  await assert.rejects(call('rewards_referral_bind_legacy',[old,code]),/existing_user/);
  await db.exec('reset role;update rewards_referral_registration_policy set enforce_first_registration=true where id;set role service_role');
  assert.equal((await call('rewards_referral_bind',[old,code])).status,'existing_user');
 }finally{await db.close()}
});

test('Twitch adapter forwards only verified identity and opaque invitation',async()=>{
 const calls=[],db={rpc:async(name,body)=>{calls.push({name,body});return {data:{userId:randomUUID()},error:null}}};
 await registerTwitchIdentity(db,{id:'123',login:'Viewer',display_name:'Name',profile_image_url:'javascript:bad'},'a'.repeat(24));
 assert.deepEqual(calls[0],{name:'rewards_register_twitch_identity',body:{p_twitch_id:'123',p_login:'viewer',p_display_name:'Name',p_avatar_url:null,p_referral_code:'a'.repeat(24)}});
 await registerTwitchIdentity(db,{id:'123',login:'viewer',display_name:'Name',profile_image_url:'https://static-cdn.jtvnw.net/known.png'},'bad');
 assert.equal(calls[1].body.p_referral_code,null);
 assert.equal(calls[1].body.p_avatar_url,'https://static-cdn.jtvnw.net/known.png');
});
