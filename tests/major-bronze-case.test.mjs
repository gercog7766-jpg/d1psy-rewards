import assert from 'node:assert/strict';
import {test} from 'node:test';
import {bronzeCasePrizes,drawBronzeCase} from '../src/major-bronze-case.ts';
import {BronzeArtworkCache,bronzeSteamImage} from '../src/major-bronze-artwork.ts';

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

test('Steam artwork cache serves the fixed catalog images and reuses successful downloads',async()=>{
 const url='https://community.steamstatic.com/economy/image/Abc_-123';
 assert.equal(bronzeSteamImage(url),url);
 assert.equal(bronzeSteamImage('https://example.com/economy/image/Abc123'),null);
 let requests=0;const cache=new BronzeArtworkCache(async()=>{requests++;return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}})});
 const [item]=cache.decorate([{name:'Skin',image:url}]);const key=item.proxy.split('/').at(-1);
 const [first,second]=await Promise.all([cache.get(key),cache.get(key)]);
 assert.deepEqual(first.body,Buffer.from([1,2,3]));assert.deepEqual(second,first);assert.equal(requests,1);
 await cache.get(key);assert.equal(requests,1);
});
test('roulette opens even if artwork fails, uses image-only slots and inventory wording',async()=>{
 const {JSDOM}=await import('jsdom'),{majorPickemPage,majorPickemScript}=await import('../src/major-pickem-ui.ts');
 const {window:w}=new JSDOM(majorPickemPage,{runScripts:'outside-only',url:'https://dropso.site/predict/major-pickem'});
 const catalog=bronzeCasePrizes.map((p,i)=>({name:p.name,image:'https://example.com/skin-'+i+'.png'}));
 let imageFailure=true,opens=0;
 const until=async predicate=>{for(let i=0;i<500;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20))}assert(predicate(),'roulette UI did not reach expected state')};
 try{
  const original=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>original(fn,ms===5900||ms===60?1:ms,...args);
  w.Image=class{set src(value){this._src=value;queueMicrotask(()=>imageFailure?this.onerror?.():this.onload?.())}};
  w.fetch=async url=>({ok:true,json:async()=>url.endsWith('/open')?(opens++,{name:catalog[5].name,image:catalog[5].image,catalog,tokens:2-opens}):{now:new Date().toISOString(),balance:0,entered:true,medal:1,tokens:2,stages:[]}});
  w.eval(majorPickemScript);const btn=w.document.getElementById('openBronzeCase'),status=w.document.getElementById('bronzeCaseStatus');
  await until(()=>!btn.disabled);
  btn.click();await until(()=>opens===1&&!btn.disabled&&status.textContent.includes('Доступен в инвентаре.'));
  assert(!w.document.getElementById('bronzeRoulette').hidden);
  assert.equal(w.document.querySelectorAll('.bronze-slot').length,56);
  assert.equal(w.document.querySelectorAll('.bronze-slot-won').length,1);
  assert(w.document.getElementById('bronzeStrip').style.transition.includes('5800ms'));
  assert([...w.document.querySelectorAll('.bronze-slot:not(.bronze-slot-won) img')].every(img=>img.getAttribute('src').startsWith('data:image/svg+xml,')));
  assert(!w.document.querySelector('.bronze-slot img[src="/predict/major-bronze-case.webp"]'));
  imageFailure=false;btn.click();await until(()=>opens===2&&status.textContent.includes('Доступен в инвентаре.')&&w.document.querySelectorAll('.bronze-slot').length===56);
  const slots=[...w.document.querySelectorAll('.bronze-slot')];assert.equal(slots.length,56);assert(slots.every(s=>s.children.length===1&&/^\/predict\/major-bronze-skins\/(?:[0-9]|10|11)$/.test(s.firstChild.getAttribute('src'))));
  assert.equal(slots[49].firstChild.getAttribute('src'),'/predict/major-bronze-skins/5');
  assert(w.document.getElementById('bronzeCaseStatus').textContent.includes('Доступен в инвентаре.'));
 }finally{w.close()}
});
