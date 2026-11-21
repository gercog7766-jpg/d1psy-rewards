import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {dropsoLevel,dropsoThreshold,dropsoProgress,dropsoRewards} from '../src/dropso-level.ts';
import {dropsoLevelPage,dropsoLevelPageScript} from '../src/dropso-level-page.ts';
test('new curve keeps levels 1–50 and rises to 100 with a strict increasing threshold',()=>{
 for(let l=1;l<=50;l++)assert.equal(dropsoThreshold(l),Math.round(37.5*(l-1)*(l+2)));
 for(let l=2;l<=100;l++){assert(dropsoThreshold(l)>dropsoThreshold(l-1));assert.equal(dropsoLevel(dropsoThreshold(l)),l);assert.equal(dropsoLevel(dropsoThreshold(l)-1),l-1)}
 assert.deepEqual([50,60,80,100].map(dropsoThreshold),[95550,154050,399050,891550]);assert.equal(dropsoLevel(99999999),100);assert.equal(dropsoProgress(99999999).remaining,0);
});
test('migration retains old rank and XP, protects one-time new rewards and level cosmetics',async()=>{
 const db=new PGlite();
 try{await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table rewards_users(id uuid primary key default gen_random_uuid(),xp_total int default 0,updated_at timestamptz,banned boolean default false,participation_restricted boolean default false,level_frame text default 'none',level_color text default 'default');
 create table rewards_xp_history(user_id uuid,amount int,reason text,source_type text,source_id text,unique(user_id,source_type,source_id));
 create table rewards_coin_transactions(user_id uuid,amount int,transaction_type text,note text);
 create table rewards_season_progress(user_id uuid,season_id text,sp int);
 create table rewards_season_reward_claims(user_id uuid,season_id text,level int);
 create table rewards_level_claims(user_id uuid,level int,primary key(user_id,level));
 insert into rewards_users(xp_total) values(96673),(160000),(500),(2000000)`);
 const fixture=await readFile(new URL('./fixtures/game-bp-existing.sql',import.meta.url),'utf8');
 await db.exec(fixture.slice(0,fixture.indexOf('CREATE OR REPLACE FUNCTION public.rewards_season_add_task_progress')));
 const before=(await db.query('select id,xp_total,rewards_level_from_xp(xp_total) level from rewards_users order by xp_total')).rows;
 await db.query('insert into rewards_level_claims values($1,50)',[before[1].id]);
 await db.exec(await readFile(new URL('../supabase/migrations/20261121200000_dropso_level_v2.sql',import.meta.url),'utf8'));
 const after=(await db.query('select id,xp_total,rewards_level_from_xp(xp_total) level from rewards_users')).rows;
 for(const u of before){const next=after.find(x=>x.id===u.id);assert(next.xp_total>=u.xp_total);assert.equal(next.level,Math.min(100,u.level));assert.equal(next.level,dropsoLevel(next.xp_total))}
 for(let l=1;l<=100;l++)assert.equal((await db.query('select rewards_dropso_level_threshold($1) t',[l])).rows[0].t,dropsoThreshold(l));
 const high=after.find(x=>x.level===100).id,low=after.find(x=>x.level===50).id;
 const claim=async(user,l)=>(await db.query('select rewards_claim_level_reward_v2($1,$2) r',[user,l])).rows[0].r;
 assert.equal((await claim(low,60)).error,'level_locked');assert.equal((await claim(high,60)).coins,350);assert.equal((await claim(high,60)).already_claimed,true);
 assert.equal((await db.query('select sum(amount)::int n from rewards_coin_transactions')).rows[0].n,350);
 assert.equal((await db.query('select rewards_level_v2_equip($1,60,false) r',[high])).rows[0].r.equipped,false);
 assert.equal((await db.query('select rewards_level_v2_equip($1,70,true) r',[high])).rows[0].r.error,'cosmetic_locked');
 assert.equal((await db.query('select count(*)::int n from rewards_level_claims')).rows[0].n,1);
 assert.equal((await db.query('select rewards_clan_eligible($1,100,0) yes',[high])).rows[0].yes,true);
 await db.exec('set role anon');await assert.rejects(db.query('select * from rewards_level_v2_claims'),/permission denied/);await db.exec('reset role');
 }finally{await db.close()}
});
test('full level page displays all milestones, equips a reward and filters XP history',async()=>{
 const dom=new JSDOM(dropsoLevelPage,{url:'https://dropso.test/level',runScripts:'outside-only'}),w=dom.window;
 try{const calls=[],state={...dropsoProgress(dropsoThreshold(80)),rewards:dropsoRewards,claimed:[10,20,30,40,50,60],decorations:[{level:60,equipped:true}],frame:'none',color:'default',unlocks:{}};
 w.fetch=async(path,opts)=>{calls.push(path);if(path.includes('/history?'))return{ok:true,json:async()=>({items:[],hasMore:false})};if(opts?.method){state.decorations[0].equipped=false;return{ok:true,json:async()=>({ok:true})}}return{ok:true,json:async()=>state}};
 w.eval(dropsoLevelPageScript);const d=w.document;for(let i=0;i<50&&!d.querySelector('.milestone');i++)await new Promise(r=>setTimeout(r,5));assert.equal(d.querySelectorAll('.milestone').length,10);assert.equal(d.getElementById('currentLevel').textContent,'80');assert.equal(d.querySelectorAll('.milestone[data-state="ready"]').length,2);
 d.querySelector('#decorations button').click();await new Promise(r=>setTimeout(r,10));assert(calls.includes('/api/me/level/equip'));d.getElementById('historyFilter').value='boss';d.getElementById('historyFilter').dispatchEvent(new w.Event('change'));await new Promise(r=>setTimeout(r,5));assert(calls.some(x=>x.includes('filter=boss')));
 }finally{w.close()}
});
