import {test} from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{PGlite}from'@electric-sql/pglite';
const U='00000000-0000-4000-8000-000000000001',V='00000000-0000-4000-8000-000000000002';
test('special season rewards: exact levels, cosmetics ownership, XP, inventory, badge, replay and rollback',{timeout:30000},async()=>{const d=new PGlite();await d.exec(`create role anon;create role authenticated;create role service_role;
create table rewards_users(id uuid primary key,xp_total integer default 0,banned boolean default false,participation_restricted boolean default false,level_frame text default 'none',level_color text default 'default',updated_at timestamptz);
insert into rewards_users(id,xp_total) values('${U}',100000),('${V}',0);
create table rewards_prizes(id uuid primary key default gen_random_uuid(),name text,unlimited boolean default true,status text default 'disabled');insert into rewards_prizes(name) values('Наклейка | Бицепс'),('AWP | Экзотермия FT');
create table rewards_wins(id uuid primary key default gen_random_uuid(),user_id uuid references rewards_users(id),prize_id uuid references rewards_prizes(id),source_type text,item_wear text,item_variant_kind text);
create table rewards_coin_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,amount integer,transaction_type text,note text);
create table rewards_season_progress(user_id uuid references rewards_users(id),season_id text,sp integer default 0,claimed_levels integer[] default '{}',updated_at timestamptz,primary key(user_id,season_id));
insert into rewards_season_progress(user_id,season_id,sp,claimed_levels) values('${U}','s1',65250,'{1}'),('${V}','s1',18999,'{}');
create table rewards_xp_history(user_id uuid,amount integer,source_type text,source_id text,unique(user_id,source_type,source_id));
create function rewards_award_xp(uuid,integer,text,text,text) returns void language plpgsql set search_path='' as $$begin insert into public.rewards_xp_history values($1,$2,$4,$5) on conflict do nothing;if found then update public.rewards_users set xp_total=xp_total+$2 where id=$1;end if;end$$;`);
await d.exec(await readFile(new URL('../supabase/migrations/20261107221335_season_special_rewards_and_cosmetics.sql',import.meta.url),'utf8'));
const claim=async(l,u=U)=>(await d.query('select rewards_claim_season_reward($1,$2,$3) x',[u,'s1',l])).rows[0].x;
const cos=async(f,c,u=U)=>(await d.query('select rewards_set_level_cosmetics($1,$2,$3) x',[u,f,c])).rows[0].x;
const count=async(t)=>(await d.query('select count(*) n from '+t)).rows[0].n;
try{
assert.equal((await claim(1)).error,'already_claimed');assert.equal((await claim(21,V)).error,'level_locked');assert.equal((await cos('s1','default')).error,'cosmetic_locked');assert.equal((await cos('none','s1')).error,'cosmetic_locked');assert.equal((await cos('rare','gold',V)).error,'cosmetic_locked');assert.equal((await cos('frame1','gold')).ok,true);
for(const l of [21,22,23,24,50]){assert.equal((await claim(l)).ok,true);assert.equal((await claim(l)).error,'already_claimed')}
assert.equal(await count('rewards_wins'),2);assert.equal(await count('rewards_coin_transactions'),0);assert.equal(await count('rewards_xp_history'),1);assert.equal((await d.query('select xp_total from rewards_users where id=$1',[U])).rows[0].xp_total,100300);assert.equal(await count('rewards_season_reward_claims'),5);assert.equal((await cos('s1','s1')).ok,true);assert.equal((await cos('none','default')).ok,true);
assert.equal((await d.query("select count(*) n from rewards_wins where source_type='season' and item_wear='FT'")).rows[0].n,1);
assert.equal((await claim(25)).amount,30);assert.equal((await claim(25)).error,'already_claimed');assert.equal(await count('rewards_coin_transactions'),1);
assert.equal((await d.query('select rewards_claim_season_coin_reward($1,$2,26,9999) x',[U,'s1'])).rows[0].x.error,'invalid_reward');assert.equal((await d.query('select rewards_claim_season_coin_reward($1,$2,50,80) x',[U,'s1'])).rows[0].x.error,'invalid_reward');
await d.query("update rewards_season_progress set sp=65249 where user_id=$1",[V]);assert.equal((await claim(50,V)).error,'level_locked');await d.query("update rewards_season_progress set sp=65250 where user_id=$1",[V]);
await d.exec("update rewards_prizes set name='unavailable' where name='AWP | Экзотермия FT'");await assert.rejects(claim(50,V),/season_prize_missing/);assert.equal((await d.query('select 50=any(claimed_levels) claimed from rewards_season_progress where user_id=$1',[V])).rows[0].claimed,false);assert.equal(await count('rewards_wins'),2);
await d.exec("update rewards_prizes set name='AWP | Экзотермия FT' where name='unavailable'");assert.equal((await claim(50,V)).badge,true);assert.equal(await count('rewards_wins'),3);assert.equal((await cos('none','s1',V)).error,'cosmetic_locked'); // badge does not grant the level-21 colour
await d.exec('set role anon');await assert.rejects(d.query('select * from rewards_season_reward_claims'),/permission denied/);await assert.rejects(claim(22),/permission denied/);await assert.rejects(cos('rare','gold'),/permission denied/);await d.exec('reset role');
}finally{await d.close()}
});
