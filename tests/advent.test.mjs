import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ADVENT_REWARDS,ADVENT_START,ADVENT_SALE_END,ADVENT_CLAIM_END,ADVENT_NOMINAL_BUDGET,adventAvailableDay,adventClaimOpen,adventSaleOpen} from '../src/advent-config.ts';
import {adventHtml,adventAccountBanner,adventJs} from '../src/advent-ui.ts';
import {JSDOM} from 'jsdom';
import {withSiteNavigation} from '../src/site-navigation.ts';
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
test('festive layout keeps the full-width calendar, shared banner typography and decorative art',()=>{
 const dom=new JSDOM(withSiteNavigation(adventHtml,'/advent'));
 try{const doc=dom.window.document;assert.equal(doc.querySelector('#dropsoSiteSidebar'),null);assert(doc.querySelector('.advent-shell .advent-waves'));assert.equal(doc.querySelectorAll('.advent-decoration img').length,2);assert.equal(doc.querySelectorAll('.grid .day').length,31);assert(doc.querySelector('.purchase svg'));assert.match(adventAccountBanner,/class="seasonAccountTitle">АДВЕНТ/);assert.doesNotMatch(adventAccountBanner,/seasonAccountTitle\{font-size/)}finally{dom.window.close()}
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
test('calendar purchase uses the shared Dropso dialog, cancels safely and prevents duplicate requests',async()=>{
 const dom=new JSDOM(adventHtml,{runScripts:'outside-only',url:'https://dropso.site/advent'}),w=dom.window;
 let purchased=false,posts=0,confirmations=0,resolveConfirm;const notices=[];
 try{
  w.confirm=()=>{throw Error('native confirm must not be used')};
  w.dropsoConfirm=()=>{confirmations++;return new Promise(resolve=>{resolveConfirm=resolve})};
  w.dropsoNotice=(text)=>notices.push(text);
  w.fetch=async(path)=>{if(path.endsWith('/buy')){posts++;purchased=true}return {ok:true,status:200,json:async()=>({purchased,availableDay:0,claimOpen:true,saleOpen:true,claimed:{},completed:false})}};
  w.eval(adventJs);await new Promise(r=>setTimeout(r,30));
  const button=w.document.querySelector('.purchase');assert.equal(w.document.querySelectorAll('.day .advent-gift').length,0);assert.equal(w.document.querySelectorAll('.day svg').length,31);button.click();button.click();assert.equal(confirmations,1);assert.equal(posts,0);assert(button.disabled);
  resolveConfirm(false);await new Promise(r=>setTimeout(r,30));assert.equal(posts,0);assert(!button.disabled);
  button.click();resolveConfirm(true);await new Promise(r=>setTimeout(r,30));assert.equal(posts,1);assert(button.hidden);assert.equal(notices.length,1);
 }finally{w.close()}
});
test('before December all windows are locked; reached dates show gifts without enabling unpaid claims',async()=>{
 const dom=new JSDOM(adventHtml,{runScripts:'outside-only',url:'https://dropso.site/advent'}),w=dom.window;let day=0,refresh;
 try{
  w.setInterval=fn=>{refresh=fn;return 1};
  w.fetch=async()=>({ok:true,status:200,json:async()=>({purchased:false,availableDay:day,claimOpen:true,saleOpen:true,claimed:{},completed:false})});
  w.eval(adventJs);await new Promise(r=>setTimeout(r,25));
  const tiles=[...w.document.querySelectorAll('button.day')];assert.equal(tiles.filter(t=>t.querySelector('.advent-gift')).length,0);
  day=1;await refresh();assert(tiles[0].querySelector('.advent-gift'));assert(!tiles[1].querySelector('.advent-gift'));assert(tiles[0].disabled);
  day=2;await refresh();assert.equal(tiles.filter(t=>t.querySelector('.advent-gift')).length,2);assert(tiles[2].querySelector('svg'));assert(tiles.every(t=>t.disabled));
 }finally{w.close()}
});
