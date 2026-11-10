import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
const migration=await readFile(new URL('../supabase/migrations/20261110203712_guess_word_game.sql',import.meta.url),'utf8');
async function fixture(){const db=new PGlite(),a=randomUUID(),b=randomUUID(),prize=randomUUID();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create table rewards_users(id uuid primary key,twitch_user_id text,twitch_login text,twitch_display_name text,banned boolean default false,participation_restricted boolean default false);
create table rewards_streamers(twitch_broadcaster_id text,is_primary boolean);insert into rewards_streamers values('owner',true);
create table rewards_prizes(id uuid primary key default gen_random_uuid(),name text,image_url text,status text,unlimited boolean,draw_weight integer,sell_price_coins integer);
create table rewards_wins(id uuid primary key default gen_random_uuid(),round_id uuid,user_id uuid references rewards_users(id),prize_id uuid references rewards_prizes(id),delivery_status text,choice_status text,source_type text);
create table rewards_coin_transactions(id uuid primary key default gen_random_uuid(),user_id uuid references rewards_users(id),amount integer check(amount<>0),transaction_type text check(transaction_type in('shop_purchase','adjustment')),note text);
create table rewards_audit_log(actor_twitch_user_id text,action text,entity_type text,entity_id uuid,details jsonb);
grant select,update on rewards_users to service_role;grant select on rewards_streamers to service_role;grant select,insert on rewards_prizes,rewards_wins,rewards_coin_transactions to service_role;grant insert on rewards_audit_log to service_role;`);
 await db.query("insert into rewards_users values($1,'a','alice','Alice',false,false),($2,'b','bob','Bob',false,false)",[a,b]);await db.query("insert into rewards_prizes values($1,'Test skin','https://example.com/skin.png','available',false,1,50)",[prize]);await db.query("insert into rewards_coin_transactions(user_id,amount,transaction_type) values($1,1000,'adjustment'),($2,1000,'adjustment')",[a,b]);await db.exec(migration);await db.exec(await readFile(new URL('../supabase/migrations/20261110205013_guess_word_readonly_spectators.sql',import.meta.url),'utf8'));await db.exec('set role service_role');
 const call=async(actor,action,body={})=>(await db.query('select rewards_guess_word($1,$2,$3::jsonb) data',[actor,action,JSON.stringify(body)])).rows[0].data;
 const start=(overrides={})=>({word:'САМАРА',hint:'Город',cost:10,prizeType:'coins',prizeCoins:100,prizeId:null,requestId:randomUUID(),...overrides});
 const guess=(roundId,guess,requestId=randomUUID())=>({roundId,guess,requestId});const balance=async actor=>(await call(actor,'state')).balance;
 return {db,a,b,prize,call,start,guess,balance};}
test('word puzzle: paid checks, hidden letters/secret, global duplicate rejection, last 20, normalization, replay and cancellation refunds',async()=>{
 const f=await fixture(),{db,call,start,guess,balance}=f;try{
 assert.equal((await call('a','state')).round,null);assert.equal((await call('owner','admin')).prizes.length,1);await assert.rejects(call('a','start',start()),/owner_required/);
 const body=start(),id=(await call('owner','start',body)).roundId;assert.equal((await call('owner','start',body)).roundId,id);await assert.rejects(call('owner','start',{...body,hint:'Другой'}),/request_conflict/);await assert.rejects(call('owner','start',start()),/round_active/);
 const initial=await call('a','state');assert.equal((await call('owner','admin')).rounds[0].word,'самара');assert.equal(initial.round.length,6);assert.equal(initial.round.answer,null);assert(!JSON.stringify(initial).includes('самара'));assert.equal(initial.balance,1000);
 await assert.rejects(call('a','guess',guess(id,'Казань!')),/invalid_request/);await assert.rejects(call('a','guess',guess(id,'город')),/invalid_length/);assert.equal(await balance('a'),1000);
 const paid=guess(id,'КАЗАНЬ');assert.equal((await call('a','guess',paid)).result,'wrong');assert.equal(await balance('a'),990);assert.equal((await call('a','guess',paid)).replayed,true);assert.equal(await balance('a'),990);await assert.rejects(call('a','guess',{...paid,guess:'Москва'}),/request_conflict/);
 assert.equal((await call('b','guess',guess(id,' казань '))).result,'duplicate');assert.equal(await balance('b'),1000);
 for(const c of 'абвгдежзийклмнопрстуфхцч')await call('a','guess',guess(id,c.repeat(6)));
 const state=await call('a','state');assert.equal(state.round.recent.length,20);assert(!state.round.recent.includes('казань'));assert.equal(state.round.answer,null);assert(!Object.hasOwn(state.round,'secret_word'));assert(!Object.hasOwn(state.round,'letters'));
 assert.equal((await call('b','guess',guess(id,'Казань'))).result,'duplicate');assert.equal(await balance('b'),1000);
 await call('owner','cancel',{roundId:id});assert.equal(await balance('a'),1000);await call('owner','cancel',{roundId:id});assert.equal(await balance('a'),1000);assert.equal((await call('a','state')).round.answer,null);await assert.rejects(call('a','guess',guess(id,'Самара')),/round_closed/);
 const next=(await call('owner','start',start({word:'ЁЖИК',hint:'Животное'}))).roundId;assert.equal((await call('a','guess',guess(next,'ежик'))).result,'won');assert.equal(await balance('a'),1090);assert.equal((await call('a','state')).round.answer,'ежик');await assert.rejects(call('owner','cancel',{roundId:next}),/round_closed/);
 }finally{await db.close()}
});
test('one winner only, first successful payment includes fee, insufficient funds and restrictions do not debit',async()=>{
 const f=await fixture(),{db,call,start,guess,balance}=f;try{
 const id=(await call('owner','start',start())).roundId;const one=guess(id,'самара'),two=guess(id,'самара');const results=await Promise.allSettled([call('a','guess',one),call('b','guess',two)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await balance('a'))+(await balance('b')),2090);
 const win=results[0].status==='fulfilled'?'a':'b',payload=win==='a'?one:two;assert.equal((await call(win,'guess',payload)).replayed,true);assert.equal((await balance('a'))+(await balance('b')),2090);
 const expensive=(await call('owner','start',start({cost:10000}))).roundId;await assert.rejects(call('b','guess',guess(expensive,'Москва')),/insufficient_coins/);await db.exec('reset role');await db.query('update rewards_users set participation_restricted=true where id=$1',[f.b]);await db.exec('set role service_role');assert.equal((await call('b','state')).canPlay,false);await assert.rejects(call('b','guess',guess(expensive,'самара')),/user_unavailable/);
 }finally{await db.close()}
});
test('skin prize uses an isolated reserved copy and inventory; failed award rolls back payment and attempt',async()=>{
 const f=await fixture(),{db,call,start,guess,balance}=f;try{
 const id=(await call('owner','start',start({prizeType:'skin',prizeCoins:null,prizeId:f.prize}))).roundId;
 const reserved=(await db.query('select prize_id from rewards_guess_rounds where id=$1',[id])).rows[0].prize_id;assert.notEqual(reserved,f.prize);
 await db.exec("reset role;create function deny_win() returns trigger language plpgsql as $$begin raise exception 'test_award_failed';end$$;create trigger deny before insert on rewards_wins for each row execute function deny_win();set role service_role");
 const body=guess(id,'Самара');await assert.rejects(call('a','guess',body),/test_award_failed/);assert.equal(await balance('a'),1000);assert.equal((await call('a','state')).round.status,'active');assert.equal((await db.query('select count(*) n from rewards_guess_attempts')).rows[0].n,0);
 await db.exec('reset role;drop trigger deny on rewards_wins;set role service_role');const win=await call('a','guess',body);assert.equal(win.result,'won');assert.equal(await balance('a'),990);const inventory=(await db.query('select * from rewards_wins')).rows;assert.equal(inventory.length,1);assert.equal(inventory[0].prize_id,reserved);assert.equal(inventory[0].source_type,'guess_word');assert.equal(inventory[0].choice_status,'awaiting_choice');assert.equal((await db.query('select status from rewards_prizes where id=$1',[f.prize])).rows[0].status,'available');
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(call('a','state'),/permission denied/);for(const table of ['rounds','attempts'])await assert.rejects(db.query('select * from rewards_guess_'+table),/permission denied/);await assert.rejects(db.query('select rewards_guess_state($1,$2)',[id,f.a]),/permission denied/)}
 }finally{await db.close()}
});
