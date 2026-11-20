import assert from 'node:assert/strict';
import {test} from 'node:test';
import {bronzeCasePrizes,drawBronzeCase} from '../src/major-bronze-case.ts';

test('bronze case has 12 exact prizes and 100 weighted slots',()=>{
  assert.equal(bronzeCasePrizes.length,12);
  assert.equal(bronzeCasePrizes.reduce((sum,item)=>sum+item.weight,0),100);
  assert.deepEqual(bronzeCasePrizes.map(x=>x.weight),[7,10,10,10,10,10,10,10,8,8,5,2]);
  for(const prize of bronzeCasePrizes)assert.equal(
    Array.from({length:100},(_,roll)=>drawBronzeCase(roll)).filter(x=>x===prize).length,prize.weight);
  assert.throws(()=>drawBronzeCase(-1),/invalid_roll/);
  assert.throws(()=>drawBronzeCase(100),/invalid_roll/);
  assert.throws(()=>drawBronzeCase(0.5),/invalid_roll/);
});

test('roulette preloads all twelve artwork images, uses image-only slots and inventory wording',async()=>{
 const {JSDOM}=await import('jsdom'),{majorPickemPage,majorPickemScript}=await import('../src/major-pickem-ui.ts');
 const {window:w}=new JSDOM(majorPickemPage,{runScripts:'outside-only',url:'https://dropso.site/predict/major-pickem'});
 const catalog=bronzeCasePrizes.map((p,i)=>({name:p.name,image:'https://example.com/skin-'+i+'.png'}));
 let incomplete=true,opens=0;
 const wait=()=>new Promise(r=>setTimeout(r,30));
 try{
  const original=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>original(fn,ms===5900||ms===60?1:ms,...args);
  w.Image=class{set src(value){this._src=value;queueMicrotask(()=>this.onload?.())}};
  w.fetch=async url=>({ok:true,json:async()=>url.endsWith('/catalog')?{items:incomplete?catalog.slice(0,11):catalog}:url.endsWith('/open')?(opens++,{name:catalog[5].name,image:catalog[5].image,catalog,tokens:1}):{now:new Date().toISOString(),balance:0,entered:true,medal:1,tokens:2,stages:[]}});
  w.eval(majorPickemScript);await wait();const btn=w.document.getElementById('openBronzeCase');
  btn.click();await wait();assert.equal(opens,0);
  incomplete=false;btn.click();await wait();assert.equal(opens,1);
  const slots=[...w.document.querySelectorAll('.bronze-slot')];assert.equal(slots.length,56);assert(slots.every(s=>s.children.length===1&&catalog.some(x=>x.image===s.firstChild.src)));
  assert.equal(slots[49].firstChild.src,catalog[5].image);
  assert(w.document.getElementById('bronzeCaseStatus').textContent.includes('Доступен в инвентаре.'));
 }finally{w.close()}
});
