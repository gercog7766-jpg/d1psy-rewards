import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {JSDOM} from 'jsdom';
import {validAuctionSchedule} from '../src/black-box.ts';
import {blackBoxPage,blackBoxScript} from '../src/black-box-ui.ts';

const schedule=[{untilMinutes:720,step:5},{untilMinutes:360,step:10},{untilMinutes:60,step:20},{untilMinutes:5,step:30},{untilMinutes:0,step:50}];
test('configured auction validates duration, descending boundaries and increasing steps',()=>{
 assert(validAuctionSchedule(1440,schedule));assert(validAuctionSchedule(5,[{untilMinutes:0,step:1}]));
 for(const [duration,stages] of [[60,schedule],[1440,[{untilMinutes:1,step:1}]],[1440,[{untilMinutes:5,step:2},{untilMinutes:0,step:1}]],[1440,[{untilMinutes:0,step:0}]],[1440,[{untilMinutes:0,step:1,extra:true}]],[1440,[]]])assert(!validAuctionSchedule(duration,stages));
});

test('daily configurable auction enforces progressive steps, unique quorum, capped extension and refunds atomically',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create table rewards_users(id uuid primary key default gen_random_uuid(),twitch_login text,twitch_display_name text,banned boolean default false,participation_restricted boolean default false);
   create table rewards_prizes(id uuid primary key default gen_random_uuid(),name text,image_url text,status text,unlimited boolean,draw_weight int,sell_price_coins int);
   create table rewards_wins(user_id uuid,prize_id uuid,source_type text,delivery_status text,choice_status text);
   create table rewards_coin_transactions(user_id uuid,amount int,transaction_type text,note text);
   grant select,update on rewards_users to service_role;grant select,insert on rewards_prizes,rewards_wins,rewards_coin_transactions to service_role;
   insert into rewards_users(twitch_login) select 'u'||n from generate_series(1,5)n;
   insert into rewards_coin_transactions select id,1000,'adjustment','fixture' from rewards_users;`);
  for(const file of ['20261111233217_black_box.sql','20261115130000_black_box_90_minutes.sql','20261122100000_black_box_progressive_auction.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const users=(await db.query('select id from rewards_users order by twitch_login')).rows.map(x=>x.id);
  await db.exec('set role service_role');
  const create=async(stages=schedule,duration=1440)=>(await db.query('select rewards_black_box_create_v2(10,$1,$2,null,300) id',[duration,JSON.stringify(stages)])).rows[0].id;
  const bid=(id,i,amount)=>db.query('select rewards_black_box_bid($1,$2,$3)',[id,users[i],amount]);
  const state=async()=>(await db.query('select rewards_black_box_state() state')).rows[0].state;
  const close=async(id)=>{await db.query('update rewards_black_boxes set ends_at=clock_timestamp() where id=$1',[id]);await db.query('select rewards_black_box_close()');await db.query('select rewards_black_box_close()')};
  await assert.rejects(create([{untilMinutes:1,step:5}]),/invalid_request/);
  const step=async minutes=>(await db.query("select rewards_black_box_step($1,'2026-11-23T00:00:00Z'::timestamptz,'2026-11-23T00:00:00Z'::timestamptz-make_interval(mins=>$2),1) step",[JSON.stringify(schedule),minutes])).rows[0].step;
  for(const [minutes,expected] of [[1440,5],[721,5],[720,10],[360,20],[60,30],[5,50],[0,50],[-10,50]])assert.equal(await step(minutes),expected);
  const id=await create();const initial=await state();assert.equal(initial.current.minimumParticipants,5);assert.equal(initial.current.step,5);assert.equal(Object.hasOwn(initial.current,'prize'),false);
  await bid(id,0,10);await bid(id,0,15);await bid(id,1,20);await bid(id,2,25);await bid(id,3,30);assert.equal((await state()).participants.length,4);
  await close(id);const cancelled=await state();assert.equal(cancelled.closed.cancelled,true);assert.equal(cancelled.closed.prize,null);assert.equal(cancelled.closed.participantCount,4);assert.equal(cancelled.previous,null);
  assert.deepEqual((await db.query("select sum(amount)::int balance from rewards_coin_transactions group by user_id order by balance")).rows.map(x=>x.balance),[1000,1000,1000,1000,1000]);
  const second=await create();for(let i=0;i<5;i++)await bid(second,i,10+i*5);
  await db.query("update rewards_black_boxes set scheduled_ends_at=clock_timestamp()+interval '1 minute',ends_at=clock_timestamp()+interval '1 minute' where id=$1",[second]);
  await assert.rejects(bid(second,0,35),/bid_too_low/);await bid(second,0,80);
  const timing=(await db.query('select ends_at>scheduled_ends_at as extended,ends_at<=scheduled_ends_at+interval \'15 minutes\' as capped from rewards_black_boxes where id=$1',[second])).rows[0];assert.deepEqual(timing,{extended:true,capped:true});assert.equal((await state()).current.step,50);
  await close(second);const won=await state();assert.equal(won.closed.cancelled,false);assert.equal(won.previous.winner,'u1');assert.equal(won.previous.amount,80);
  assert.deepEqual((await db.query('select count(*)::int n,sum(amount)::int total from rewards_coin_transactions where note=$1',['Чёрный ящик · приз · '+second])).rows[0],{n:1,total:300});
  // An existing old auction retains its original step and can settle with one bidder.
  const legacy=(await db.query("select rewards_black_box_create(10,2,null,null,50) id")).rows[0].id;await bid(legacy,1,10);await close(legacy);assert.equal((await state()).closed.cancelled,false);
  await db.exec('reset role;set role authenticated');await assert.rejects(create(),/permission denied/);
 }finally{await db.close()}
});

test('admin form submits editable schedule, duration and selected prize',async()=>{
 const dom=new JSDOM(blackBoxPage(true),{runScripts:'outside-only',url:'https://dropso.test/admin/black-box'}),w=dom.window,d=w.document;const calls=[];
 try{w.fetch=async(path,opts)=>{if(opts?.method==='POST')calls.push(JSON.parse(opts.body));return {ok:true,json:async()=>path.includes('/prizes')?[]:{ok:true}}};w.eval(blackBoxScript);await new Promise(r=>setTimeout(r,10));assert.equal(d.querySelectorAll('.schedule-row').length,5);d.getElementById('start').value='10';d.getElementById('kind').value='coins';d.getElementById('kind').onchange();d.getElementById('coins').value='300';const form=d.getElementById('create');await form.onsubmit({preventDefault(){},submitter:form.querySelector('button:not([type])')});assert.deepEqual(calls,[{start:10,durationMinutes:1440,schedule,prizeId:null,prizeCoins:300}]);assert.match(d.getElementById('notice').textContent,/запущены/)}finally{w.close()}
});

test('public auction displays live quorum and changing minimum step, and reports cancellation without revealing prize',async()=>{
 const dom=new JSDOM(blackBoxPage(false),{runScripts:'outside-only',pretendToBeVisual:true,url:'https://dropso.test/black-box'}),w=dom.window,d=w.document;let current={id:'a',endsAt:new Date(Date.now()+3600000).toISOString(),scheduledEndsAt:new Date(Date.now()+3600000).toISOString(),startPrice:10,highBid:50,step:30,schedule,minimumParticipants:5},closed=null,participants=[{name:'A',amount:50},{name:'B',amount:40}];const callbacks=[];
 try{w.setInterval=(fn,ms)=>{callbacks.push([fn,ms]);return callbacks.length};w.matchMedia=()=>({matches:true});w.fetch=async(path)=>({ok:true,json:async()=>path==='/api/black-box'?{current,closed,previous:null,participants,serverNow:new Date().toISOString()}:{messages:[]}});w.eval(blackBoxScript);await new Promise(r=>setTimeout(r,10));assert.match(d.getElementById('quorumText').textContent,/2\/5/);assert.match(d.getElementById('currentStep').textContent,/30/);assert.equal(d.getElementById('amount').min,'80');current={...current,step:50};participants=[...participants,{name:'C',amount:30},{name:'D',amount:20},{name:'E',amount:10}];await callbacks[1][0]();assert.equal(d.getElementById('auctionQuorum').dataset.ready,'true');assert.equal(d.getElementById('amount').min,'100');current=null;closed={id:'a',cancelled:true,participantCount:4,minimumParticipants:5};participants=[];await callbacks[1][0]();assert.match(d.getElementById('reveal').textContent,/Все ставки возвращены/);assert(!d.getElementById('case').classList.contains('open'));}finally{w.close()}
});
