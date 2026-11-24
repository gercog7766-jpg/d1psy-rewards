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
    const dialog=window.document.getElementById('pickemConfirm');
    assert.equal(dialog.open,true);
    window.document.getElementById('cancelPass').click();
    assert.equal(dialog.open,false);
    enter.click();
    window.document.getElementById('buyPass').click();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(enter.hidden,true);
    assert.equal(medal.textContent,'Медаль: Бронза');
    assert.equal(image.hidden,false);
    assert.equal(image.getAttribute('src'),'/predict/major-medals/bronze.webp');
    const token=window.document.getElementById('tokenIcon');
    assert.equal(token.width,image.width);
    assert.equal(token.height,image.height);
    assert.equal(window.getComputedStyle(token.closest('.tracker-item')).minHeight,
      window.getComputedStyle(image.closest('.tracker-item')).minHeight);

  } finally {
    window.close();
  }
});

const scheduledPairs = [
  ['heroic','imperial'],['9z','lynn-vision'],['nip','m80'],['100t','chinggis'],
  ['liquid','bcgame'],['parivision','dendele'],['faze','wildcard'],['eternal-fire','flyquest'],
].map(([a,b])=>({a,b,at:'2026-11-24T04:00:00Z'}));

const referenceRounds = [
  [['nip','m80'],['parivision','dendele'],['heroic','imperial'],['faze','wildcard'],
    ['liquid','bcgame'],['eternal-fire','flyquest'],['100t','chinggis'],['9z','lynn-vision']],
  [['nip','imperial'],['parivision','9z'],['faze','100t'],['liquid','eternal-fire'],
    ['heroic','lynn-vision'],['m80','chinggis'],['dendele','flyquest'],['wildcard','bcgame']],
  [['eternal-fire','100t'],['imperial','parivision'],['nip','bcgame'],['liquid','m80'],
    ['heroic','flyquest'],['faze','9z'],['dendele','lynn-vision'],['chinggis','wildcard']],
  [['imperial','9z'],['liquid','heroic'],['100t','nip'],
    ['flyquest','chinggis'],['m80','bcgame'],['faze','dendele']],
  [['100t','flyquest'],['9z','m80'],['heroic','faze']],
];
const referenceWinners = [
  ['nip','parivision','imperial','faze','liquid','eternal-fire','100t','9z'],
  ['imperial','parivision','100t','eternal-fire','heroic','m80','flyquest','bcgame'],
  ['eternal-fire','parivision','nip','liquid','heroic','9z','dendele','chinggis'],
  ['imperial','liquid','nip','flyquest','m80','faze'],
  ['100t','9z','heroic'],
];

test('Stage 1 reproduces all five rounds and qualification records in the reference simulator', async () => {
  const {JSDOM}=await import('jsdom');
  const {majorPickemPage,majorPickemScript}=await import('../src/major-pickem-ui.ts');
  const {stageOneSeeds}=await import('../src/major-pickem-swiss.ts');
  const {window}=new JSDOM(majorPickemPage,{runScripts:'outside-only',url:'https://dropso.test'});
  try {
    const lockAt='2026-11-24T03:45:00Z';
    window.fetch=async()=>({ok:true,json:async()=>({
      now:'2026-11-15T20:00:00Z',balance:500,eligible:true,canEnter:true,entered:false,medal:0,tokens:0,
      draftKey:'test',stages:[{id:1,label:'Stage 1',status:'open',lockAt,
        teams:stageOneSeeds.map(id=>({id,name:id})),pairs:scheduledPairs}],
    })});
    // This round-two pair could exist with the previous Stage 1 seed order.
    const validDraft=Object.fromEntries(referenceRounds[0].map((pair,index)=>[
      '0/'+[...pair].sort().join('/'),referenceWinners[0][index],
    ]));
    validDraft['1/imperial/nip']='imperial';
    const key='major-pickem-swiss-v1:test:1';
    window.localStorage.setItem(key,JSON.stringify({...validDraft,'1/chinggis/dendele':'chinggis'}));
    window.eval(majorPickemScript);
    await new Promise(resolve=>setImmediate(resolve));
    const doc=window.document;
    const dateTime=new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'});
    const time=new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'});
    const firstMatch=doc.querySelector('[data-round="0"] .match small');
    assert.equal(doc.getElementById('stageInfo').textContent,'Приём до '+dateTime.format(new Date(lockAt))+' · местное время');
    assert.equal(firstMatch.textContent,time.format(new Date(scheduledPairs[0].at)));
    assert.equal(firstMatch.title,dateTime.format(new Date(scheduledPairs[0].at)));
    assert.deepEqual(JSON.parse(window.localStorage.getItem(key)),validDraft);
    for(const [index,pairs] of referenceRounds.entries()){
      const round=doc.querySelector('[data-round="'+index+'"]');
      assert.deepEqual([...round.querySelectorAll('.match')].map(match=>
        [...match.querySelectorAll('button')].map(team=>team.dataset.team)),pairs);
      // The bracket is rebuilt after each pick, so subsequent clicks use the current DOM.
      for(const winner of referenceWinners[index])doc.querySelector('[data-round="'+index+'"] [data-team="'+winner+'"]').click();
    }
    const result=score=>[...doc.querySelectorAll('[data-result="'+score+'"] .result-team span')].map(node=>node.textContent);
    assert.deepEqual(result('3:0'),['eternal-fire','parivision']);
    assert.deepEqual(result('3:1'),['imperial','liquid','nip']);
    assert.deepEqual(result('3:2'),['100t','9z','heroic']);
    assert.deepEqual(result('1:3'),['chinggis','bcgame','dendele']);
    assert.deepEqual(result('2:3'),['flyquest','m80','faze']);
    assert.deepEqual(result('0:3'),['lynn-vision','wildcard']);
    assert.equal(doc.querySelector('[data-result="3:0"]').closest('.round').dataset.round,'3');
    assert.equal(doc.querySelector('[data-result="3:2"]').closest('.round').dataset.round,'4');
  } finally {window.close();}
});

test('confirmed results are read-only and do not replace personal predictions', async () => {
  const {JSDOM}=await import('jsdom');
  const {majorPickemPage,majorPickemScript}=await import('../src/major-pickem-ui.ts');
  const {stageOneSeeds}=await import('../src/major-pickem-swiss.ts');
  const {window}=new JSDOM(majorPickemPage,{runScripts:'outside-only',url:'https://dropso.test'});
  try {
    const key='major-pickem-swiss-v1:test:1',draft={'0/heroic/imperial':'heroic'};
    window.localStorage.setItem(key,JSON.stringify(draft));
    window.fetch=async()=>({ok:true,json:async()=>({now:'2026-11-24T06:25:00Z',balance:500,eligible:true,entered:true,medal:1,tokens:0,draftKey:'test',stages:[{id:1,label:'Stage 1',status:'locked',lockAt:'2026-11-24T03:45:00Z',teams:stageOneSeeds.map(id=>({id,name:id})),pairs:scheduledPairs,picks:{heroic:'3:0'}}]})});
    window.eval(majorPickemScript);await new Promise(resolve=>setImmediate(resolve));
    const doc=window.document;
    assert.deepEqual([...doc.querySelectorAll('[data-round="0"] [aria-pressed="true"]')].map(b=>b.dataset.team).sort(),['100t','flyquest','imperial','liquid','lynn-vision','nip','parivision','wildcard']);
    assert.equal(doc.querySelector('[data-round="0"] [data-team="imperial"]').disabled,true);
    assert.equal(doc.querySelectorAll('[data-round="1"] button[data-team]').length,16);
    assert.deepEqual(JSON.parse(window.localStorage.getItem(key)),draft);
    doc.getElementById('predictionMode').click();
    assert.equal(doc.querySelector('[data-round="0"] [data-team="heroic"]').getAttribute('aria-pressed'),'true');
    assert.deepEqual(JSON.parse(window.localStorage.getItem(key)),draft);
  } finally {window.close();}
});

test('Swiss bracket pairs the same record with Buchholz seeding and finishes with 16 scored teams', async () => {
  const {swissBracketScript,stageOneSeeds}=await import('../src/major-pickem-swiss.ts');
  const buildSwiss=new Function(swissBracketScript+'\nreturn buildSwiss;')();
  const selected={};
  let bracket=buildSwiss(scheduledPairs,stageOneSeeds,selected);
  assert.equal(bracket.rounds.length,1);
  for(const match of bracket.rounds[0])selected[match.id]=match.a;
  bracket=buildSwiss(scheduledPairs,stageOneSeeds,selected);
  assert.deepEqual(bracket.rounds[1].slice(0,4).map(({a,b})=>[a,b]),
    [['nip','9z'],['parivision','100t'],['heroic','eternal-fire'],['faze','liquid']]);

  for(let run=1;run<=128;run++){
    let random=run;
    const picks={},seen=new Set();
    for(let round=0;round<5;round++){
      bracket=buildSwiss(scheduledPairs,stageOneSeeds,picks);
      const matches=bracket.rounds[round];
      assert.equal(matches.length,[8,8,8,6,3][round]);
      assert.equal(new Set(matches.flatMap(({a,b})=>[a,b])).size,matches.length*2);
      for(const match of matches){
        const pair=[match.a,match.b].sort().join('/');
        assert(!seen.has(pair),'unexpected rematch in simulation '+run);
        seen.add(pair);
        random=(Math.imul(1664525,random)+1013904223)>>>0;
        picks[match.id]=random<2**31?match.a:match.b;
      }
    }
    const {terminal}=buildSwiss(scheduledPairs,stageOneSeeds,picks);
    const counts=Object.values(terminal).reduce((all,record)=>{
      all[record]=(all[record]||0)+1;
      return all;
    },{});
    assert.deepEqual(counts,{'3:0':2,'3:1':3,'3:2':3,'1:3':3,'2:3':3,'0:3':2});
  }
});

test('teams can be selected before purchase, and the completed bracket submits Swiss results', async () => {
  const {JSDOM}=await import('jsdom');
  const {majorPickemPage,majorPickemScript}=await import('../src/major-pickem-ui.ts');
  const {stageOneSeeds}=await import('../src/major-pickem-swiss.ts');
  const {window}=new JSDOM(majorPickemPage,{runScripts:'outside-only',url:'https://dropso.test/predict/major-pickem'});
  try {
    const docs=window.document;
    const query=selector=>docs.querySelector(selector);
    const wait=()=>new Promise(resolve=>setImmediate(resolve));
    const stage={
      id:1,label:'Stage 1',status:'open',lockAt:new Date(Date.now()+3600000).toISOString(),
      teams:stageOneSeeds.map(id=>({id,name:id})),pairs:scheduledPairs,
    };
    const request=[];
    let entered=false;
    window.fetch=async(url,opts)=>{
      if(url.endsWith('/enter'))entered=true;
      if(url.endsWith('/save')){request.push(JSON.parse(opts.body));stage.picks=request[0].selections;}
      return {ok:true,json:async()=>({now:new Date().toISOString(),balance:500,eligible:true,
        canEnter:true,entered,medal:entered?1:0,tokens:0,stages:[stage],draftKey:'test'})};
    };
    window.eval(majorPickemScript);
    await wait();
    assert(query('#save').hidden);
    assert.equal(query('[data-round="1"] button'),null);
    function chooseAll(round){
      const buttons=[...docs.querySelectorAll('[data-round="'+round+'"] .match button:first-child')];
      assert(buttons.length>0);
      for(const {dataset:{match,team}} of buttons)query('[data-match="'+match+'"][data-team="'+team+'"]').click();
    }
    chooseAll(0);
    assert.equal(docs.querySelectorAll('[data-round="1"] .match button').length,16);
    assert.equal(Object.keys(JSON.parse(window.localStorage.getItem('major-pickem-swiss-v1:test:1'))).length,8);
    chooseAll(1);
    const earlier=query('[data-round="0"] .team.lost');
    earlier.click();
    assert.equal(docs.querySelectorAll('[data-round="1"] [aria-pressed="true"]').length,0);
    assert.equal(query('[data-round="2"] button'),null);
    query('#enter').click();
    query('#buyPass').click();
    await wait();
    for(let i=1;i<5;i++)chooseAll(i);
    assert.equal(query('#save').disabled,false);
    query('#save').click();
    await wait();
    assert.equal(request.length,1);
    assert.equal(Object.keys(request[0].selections).length,16);
    assert.equal(query('#saved').textContent,'Прогноз сохранён');
    assert.equal(docs.querySelectorAll('#grid .result-team').length,16);
  } finally {window.close();}
});

test('Major Pick’em admin lists paid players and saved stages with pagination and admin-only access', async () => {
  const {default:express}=await import('express');
  const {createClient}=await import('@supabase/supabase-js');
  const {JSDOM}=await import('jsdom');
  const {installMajorPickem}=await import('../src/major-pickem.ts');
  const requests=[];
  const db=createClient('https://supabase.test','server-key',{global:{fetch:async url=>{
    requests.push(new URL(url));
    const entries=Array.from({length:51},(_,i)=>({
      player:{twitch_display_name:i===0?'<img onerror=alert(1)>':'Player '+i,twitch_login:'player'+i},
      paid:i===0?0:250,tokens:i===0?12:0,picks:i===0?[{stage:1},{stage:3}]:[],
    }));
    return Response.json(entries);
  }}});
  const app=express();
  installMajorPickem(app,db,(_req,res)=>res.sendStatus(401),(req,res,next)=>{
    const role=req.get('x-test-role');
    if(role==='admin')next();
    else res.sendStatus(role?403:401);
  },'https://dropso.test');
  const server=app.listen(0,'127.0.0.1');
  try {
    await new Promise(resolve=>server.once('listening',resolve));
    const url='http://127.0.0.1:'+server.address().port+'/admin/major-pickem';
    assert.equal((await fetch(url)).status,401);
    assert.equal((await fetch(url,{headers:{'x-test-role':'viewer'}})).status,403);
    const headers={'x-test-role':'admin'};
    const editorUrl=url.replace('major-pickem','major-cases');
    assert.equal((await fetch(editorUrl)).status,401);
    assert.equal((await fetch(editorUrl,{headers:{'x-test-role':'viewer'}})).status,403);
    const editor=new JSDOM(await(await fetch(editorUrl,{headers})).text());
    assert.equal(editor.window.document.querySelector('#file').type,'file');
    assert(editor.window.document.querySelector('#rows'));assert(editor.window.document.querySelector('#save'));editor.window.close();
    assert.equal((await fetch(url+'?page=0',{headers})).status,400);
    assert.equal(requests.length,0);
    const response=await fetch(url+'?page=2',{headers});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    const [request]=requests;
    assert.equal(request.pathname,'/rest/v1/rewards_major_pickem_entries');
    assert.match(request.searchParams.get('select'),/paid,tokens,player:rewards_users!.*\(twitch_login,twitch_display_name\),picks:rewards_major_pickem_picks!.*\(stage\)/);
    assert.equal(request.searchParams.get('order'),'entered_at.desc,user_id.asc');
    assert.equal(request.searchParams.get('offset'),'50');
    assert.equal(request.searchParams.get('limit'),'51');
    const {window}=new JSDOM(await response.text());
    try {
      const doc=window.document;
      assert.equal(doc.querySelectorAll('tbody tr').length,50);
      assert.equal(doc.querySelector('tbody img'),null);
      const [player,...values]=doc.querySelector('tbody tr').children;
      assert.equal(player.textContent,'<img onerror=alert(1)>@player0Промокод');
      assert.deepEqual(values.map(cell=>cell.textContent),['Сохранён','—','Сохранён','—','12']);
      assert.equal(doc.querySelector('[rel=prev]').getAttribute('href'),'?page=1');
      assert.equal(doc.querySelector('[rel=next]').getAttribute('href'),'?page=3');
    } finally {window.close();}
  } finally {await new Promise(resolve=>server.close(resolve));}
});
