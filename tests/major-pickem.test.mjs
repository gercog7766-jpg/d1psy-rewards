import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('Major Pick’em gates entry and validates the complete Swiss slate before the deadline', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table rewards_users(id uuid primary key default gen_random_uuid(), twitch_user_id text unique, banned boolean default false, participation_restricted boolean default false);
      create table rewards_coin_transactions(user_id uuid, amount int, transaction_type text, note text);
      grant select,update on rewards_users to service_role;
      grant select,insert on rewards_coin_transactions to service_role;
      insert into rewards_users(twitch_user_id) values('alice'),('bob');
      insert into rewards_coin_transactions select id,500,'adjustment','fixture' from rewards_users where twitch_user_id='alice';
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20261115150000_major_pickem.sql',import.meta.url),'utf8'));
    await db.exec(`insert into rewards_major_pickem_entries(user_id,paid)
      select id,250 from rewards_users where twitch_user_id='bob';
      insert into rewards_users(twitch_user_id) values('charlie');`);
    await db.exec(await readFile(new URL('../supabase/migrations/20261115160000_major_pickem_medals.sql',import.meta.url),'utf8'));
    const { rows:[timing] } = await db.query("select extract(epoch from first_match_at-lock_at)::int as seconds from rewards_major_pickem_stages where stage=1");
    assert.equal(timing.seconds,900);
    await db.exec("update rewards_major_pickem_stages set open_at=now()-interval '1 day',lock_at=now()+interval '1 day',first_match_at=now()+interval '2 days' where stage=1; set role service_role");
    const call = async (who,action,stage=null,picks=null) =>
      (await db.query('select rewards_major_pickem($1,$2,$3,$4) as result',[who,action,stage,picks])).rows[0].result;
    const state = await call('alice','state');
    const first = state.stages[0];
    assert.equal(state.stages.length,4);
    assert.equal(first.teams.length,16);
    assert.equal(first.pairs.length,8);
    assert.equal(new Set(first.pairs.flatMap(pair=>[pair.a,pair.b])).size,16);
    await assert.rejects(call('alice','save',1,{}),/entry_required/);
    await assert.rejects(call('charlie','enter'),/insufficient_coins/);
    assert.equal((await call('bob','state')).medal,1);
    assert.equal(state.medal,0);
    const entry=await call('alice','enter');
    assert.equal(entry.medal,1);
    assert.equal(entry.balance,250);
    assert.equal((await call('alice','enter')).balance,250);
    const scores=['3:0','3:0','3:1','3:1','3:1','3:2','3:2','3:2','1:3','1:3','1:3','2:3','2:3','2:3','0:3','0:3'];
    const picks=Object.fromEntries(first.teams.map((team,i)=>[team.id,scores[i]]));
    await assert.rejects(call('alice','save',1,{...picks,[first.teams[0].id]:'0:3'}),/invalid_picks/);
    await assert.rejects(call('alice','save',2,picks),/stage_locked/);
    assert.deepEqual((await call('alice','save',1,picks)).stages[0].picks,picks);
    assert.equal((await call('bob','state')).stages[0].picks,null);
    await db.exec("reset role; update rewards_major_pickem_stages set lock_at=now()-interval '1 second' where stage=1; update rewards_major_pickem_picks set saved_at=now()-interval '2 seconds' where stage=1; set role service_role");
    await assert.rejects(call('alice','save',1,picks),/stage_locked/);
    await assert.rejects(call('charlie','enter'),/entry_closed/);

    const settle=async (stage,results)=>
      (await db.query('select rewards_major_pickem_settle($1,$2) as settled',[stage,results])).rows[0].settled;
    const outcomes=Object.fromEntries(Object.entries(picks).map(([team,score])=>[
      team,({'3:1':'3:2','3:2':'3:1','1:3':'2:3','2:3':'1:3'})[score]??score
    ]));
    await assert.rejects(settle(1,{}),/invalid_results/);
    assert.equal(await settle(1,outcomes),true);
    assert.equal(await settle(1,outcomes),false);
    await assert.rejects(settle(1,picks),/stage_already_settled/);
    const after=await call('alice','state');
    assert.equal(after.medal,2);
    assert.equal(after.tokens,4);
    await db.exec(`reset role;
      update rewards_major_pickem_stages set open_at=now()-interval '2 days',
        lock_at=now()-interval '1 day',first_match_at=now()-interval '12 hours' where stage>1;
      insert into rewards_major_pickem_teams(stage,team,name,logo)
        select stage.id,t.team,t.name,t.logo from rewards_major_pickem_teams t
        cross join (values(2),(3),(4)) stage(id) where t.stage=1;
      insert into rewards_major_pickem_picks(stage,user_id,selections,saved_at)
        select stage.id,p.user_id,p.selections,now()-interval '36 hours' from rewards_major_pickem_picks p
        cross join (values(2),(3)) stage(id) where p.stage=1;
      insert into rewards_major_pickem_picks(stage,user_id,selections,saved_at)
        select 3,u.id,p.selections,now()-interval '36 hours' from rewards_users u
        cross join rewards_major_pickem_picks p where u.twitch_user_id='bob' and p.stage=1;
      set role service_role;`);
    assert.equal(await settle(2,picks),true);
    assert.equal((await call('alice','state')).medal,3);
    assert.equal(await settle(3,picks),true);
    assert.equal((await call('alice','state')).medal,4);
    assert.equal((await call('bob','state')).medal,2);
    const teams=Object.keys(picks);
    const playoffs={'qf-1':teams[0],'qf-2':teams[1],'qf-3':teams[2],'qf-4':teams[3],
      'sf-1':teams[0],'sf-2':teams[2],final:teams[0]};
    await db.query(`insert into rewards_major_pickem_picks(stage,user_id,selections,saved_at)
      select 4,id,case when twitch_user_id='alice' then $1::jsonb else $2::jsonb end,now()-interval '36 hours'
      from rewards_users where twitch_user_id in ('alice','bob')`,
      [{...playoffs,'qf-2':teams[5],'qf-4':teams[7],'sf-2':teams[7]},{...playoffs,final:teams[2]}]);
    await assert.rejects(settle(4,{...playoffs,'sf-1':teams[3]}),/invalid_results/);
    assert.equal(await settle(4,playoffs),true);
    const final=await call('alice','state');
    assert.equal(final.medal,5);
    assert.equal(final.tokens,40);
    assert.equal((await call('bob','state')).medal,2);
    await db.exec('reset role; set role authenticated');
    await assert.rejects(call('alice','state'),/permission denied/);
    await assert.rejects(settle(1,outcomes),/permission denied/);
  } finally {
    await db.close();
  }
});

test('Pick’em shows the awarded artwork as soon as purchase succeeds', async () => {
  const {JSDOM}=await import('jsdom');
  const {majorPickemPage,majorPickemScript}=await import('../src/major-pickem-ui.ts');
  const {window}=new JSDOM(majorPickemPage,{runScripts:'outside-only'});
  try {
    window.dropsoConfirm=async()=>true;
    window.fetch=async url=>({ok:true,json:async()=>({
      now:new Date().toISOString(),balance:250,eligible:true,canEnter:true,
      entered:url.endsWith('/enter'),medal:url.endsWith('/enter')?1:0,tokens:0,stages:[]
    })});
    window.eval(majorPickemScript);
    const enter=window.document.getElementById('enter');
    const image=window.document.querySelector('#medal img');
    const medal=window.document.getElementById('medalName');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(image.hidden,true);
    assert.equal(enter.disabled,false);
    enter.click();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(enter.hidden,true);
    assert.equal(medal.textContent,'Медаль: Бронза');
    assert.equal(image.hidden,false);
    assert.equal(image.getAttribute('src'),'/predict/major-medals/bronze.webp');
  } finally {
    window.close();
  }
});
