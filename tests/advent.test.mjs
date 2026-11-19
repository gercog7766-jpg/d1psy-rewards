import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ADVENT_REWARDS,ADVENT_START,ADVENT_SALE_END,ADVENT_CLAIM_END,ADVENT_NOMINAL_BUDGET,adventAvailableDay,adventClaimOpen,adventSaleOpen} from '../src/advent-config.ts';
import {adventHtml,adventAccountBanner,adventJs} from '../src/advent-ui.ts';
import {JSDOM} from 'jsdom';
test('calendar has exactly 31 fixed rewards and seven cosmetics in approved order',()=>{
 assert.equal(ADVENT_REWARDS.length,31);
 assert.deepEqual(ADVENT_REWARDS.flatMap(([kind],i)=>kind==='exclusive'?[i+1]:[]),[2,6,10,14,18,22,31]);
 assert.deepEqual(ADVENT_REWARDS[29],['coins',15]);
 assert.equal(ADVENT_NOMINAL_BUDGET,272);
});
test('December date boundaries and inclusive sale and catch-up periods',()=>{
 assert.equal(adventAvailableDay(ADVENT_START-1),0);
 assert.equal(adventAvailableDay(ADVENT_START),1);
 assert.equal(adventAvailableDay(ADVENT_START+30*86400000),31);
 assert.equal(adventSaleOpen(ADVENT_SALE_END-1),true);
 assert.equal(adventSaleOpen(ADVENT_SALE_END),false);
 assert.equal(adventClaimOpen(ADVENT_CLAIM_END-1,1),true);
 assert.equal(adventClaimOpen(ADVENT_CLAIM_END,1),false);
 assert.equal(adventClaimOpen(ADVENT_START,2),false);
});
test('public preview reveals no future rewards or monetary budget',()=>{
 assert.equal((adventHtml.match(/class="day"/g)||[]).length,31);
 assert.doesNotMatch(adventHtml,/snowflake|winter_background|gold_frame|272|МСК/);
 assert.match(adventAccountBanner,/class="seasonAccountHero adventAccountHero" href="\/advent"/);
});
test('calendar UI only opens server-authorized days, reveals claimed reward and remains recoverable',async()=>{
 const dom=new JSDOM(adventHtml,{runScripts:'outside-only',url:'https://dropso.site/advent'}),w=dom.window;
 const state={purchased:true,availableDay:3,claimOpen:true,saleOpen:false,claimed:{},completed:false};
 try{
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
  w.fetch=async(path,opts)=>{let data=state;if(path.endsWith('collection'))data=[];if(path.endsWith('claim')){assert.deepEqual(JSON.parse(opts.body),{day:1});state.claimed[1]={kind:'coins',name:'5 монет'};state.reward=state.claimed[1]}return {ok:true,status:200,json:async()=>structuredClone(data)}};
  w.eval(adventJs);await new Promise(r=>setTimeout(r,30));
  const tiles=[...w.document.querySelectorAll('button.day')];assert.equal(tiles.length,31);assert.equal(tiles.filter(t=>!t.disabled).length,3);assert(tiles[3].disabled);
  assert(!w.document.body.textContent.includes('5 монет'));tiles[0].click();await new Promise(r=>setTimeout(r,30));
  assert(tiles[0].classList.contains('opened'));assert(w.document.querySelector('dialog').open);assert.equal(w.document.querySelector('dialog h2').textContent,'5 монет');
 }finally{w.close()}
});
