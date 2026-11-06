import assert from 'node:assert/strict';
import {test} from 'node:test';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHmac,randomUUID} from 'node:crypto';
import {JSDOM,VirtualConsole} from 'jsdom';

test('full shop UI: variant favorites, goal, budget/quality filters, sort, persistence and existing cart purchase',{timeout:35000},async()=>{
 const user=randomUUID(),item=randomUUID(),fixed=randomUUID(),ft=randomUUID(),st=randomUUID(),fn=randomUUID(),bs=randomUUID();
 let balance=80,goal=null,favorites=[],rpcParams,buyRequests=[];
 const products=[{id:item,name:'AK-47 | Test',image_url:'/test.png',price_coins:90,stock:null},{id:fixed,name:'Sticker | Test',image_url:'/sticker.png',price_coins:30,stock:null}];
 const variants=[{id:ft,wear:'FT',variant_kind:'normal',price_coins:100,available:true},{id:st,wear:'FN',variant_kind:'stattrak',price_coins:200,available:true},{id:fn,wear:'FN',variant_kind:'normal',price_coins:150,available:true},{id:bs,wear:'BS',variant_kind:'normal',price_coins:60,available:true}];
 function data(){return {balance,goalFavoriteId:goal,favorites:favorites.map(f=>{const p=products.find(x=>x.id===f.itemId),v=variants.find(x=>x.id===f.variantId);return {...f,name:p.name,image:p.image_url,wear:v?.wear||null,kind:v?.variant_kind||'normal',price:v?v.price_coins:p.price_coins,available:p.stock!==0&&(!v||v.available)}})}}
 const mock=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');const url=new URL(req.url,'http://test');
  if(url.pathname.endsWith('/rewards_users'))return res.end(JSON.stringify({id:user,twitch_login:'viewer',steam_trade_url_valid:true}));
  if(url.pathname.includes('/rpc/rewards_market_')){let raw='';for await(const c of req)raw+=c;rpcParams=JSON.parse(raw);assert.equal(rpcParams.p_user,user);
   if(url.pathname.endsWith('_set')){const key=String(rpcParams.p_item)+'|'+String(rpcParams.p_variant),found=favorites.find(f=>f.itemId+'|'+f.variantId===key);
    if(rpcParams.p_action==='clear_goal')goal=null;
    if(['favorite','goal'].includes(rpcParams.p_action)){const f=found||{id:randomUUID(),itemId:rpcParams.p_item,variantId:rpcParams.p_variant};if(!found)favorites.push(f);if(rpcParams.p_action==='goal')goal=f.id}
    if(rpcParams.p_action==='unfavorite'&&found){favorites=favorites.filter(f=>f.id!==found.id);if(goal===found.id)goal=null}
   }return res.end(JSON.stringify(data()));
  }
  res.end('[]');
 });
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));const mockPort=mock.address().port;
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const server=spawn(process.execPath,['--import','tsx','src/server-entry.ts'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),SESSION_SECRET:'market-ui-test',SUPABASE_URL:'http://127.0.0.1:'+mockPort,SUPABASE_SECRET_KEY:'test-key',TWITCH_CLIENT_ID:'',TWITCH_EVENTSUB_SECRET:''},stdio:'ignore'});
 const base='http://127.0.0.1:'+port,payload=Buffer.from(JSON.stringify({twitchUserId:'viewer',exp:Date.now()+120000})).toString('base64url'),cookie='rewards_session='+payload+'.'+createHmac('sha256','market-ui-test').update(payload).digest('base64url');
 let dom;
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 async function until(fn){for(let i=0;i<150;i++){if(fn())return;await pause(20)}assert(fn(),'UI condition timed out')}
 try{
  for(let i=0;i<100;i++){try{await fetch(base+'/shop-v2.js');break}catch{await pause(50)}}
  assert.equal((await fetch(base+'/api/me/market')).status,401);
  const spoof=await fetch(base+'/api/me/market',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({action:'clear_goal',user_id:randomUUID()})});assert.equal(spoof.status,200);assert.equal(rpcParams.p_user,user);
  const invalid=await fetch(base+'/api/me/market',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({action:'favorite',itemId:item,variantId:'bad'})});assert.equal(invalid.status,400);
  const html=await(await fetch(base+'/shop',{headers:{Cookie:cookie}})).text(),client=await(await fetch(base+'/shop-v2.js')).text(),account=await(await fetch(base+'/account')).text();
  assert(html.includes('D1PSY MARKET'));assert(html.includes('id="shopMarketDesign"'));assert(html.includes('data-market-design="cards"'));assert(html.includes('marketHeading'));assert(html.includes('id="marketModalActions"'));assert(html.includes('id="cartTop"'));assert(account.includes('id="marketProfileLink"'));assert(client.includes('marketVariantsReady=vr.ok;'));
  const errors=[];
  async function mount(view=''){
   if(dom)dom.window.close();const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));dom=new JSDOM(html,{runScripts:'outside-only',url:base+'/shop'+view,virtualConsole:vc});const w=dom.window;
   w.alert=()=>{};w.confirm=()=>true;w.Response=Response;
   w.fetch=async(url,opts)=>{
    if(String(url).startsWith('/api/me/economy'))return new Response(JSON.stringify({balance,shop:products}),{status:200});
    if(String(url).startsWith('/api/me/shop-variant-test'))return new Response(JSON.stringify({items:[{itemId:item,name:products[0].name,variants}],balance,hiddenNames:[]}),{status:200});
    if(String(url).startsWith('/api/me/market'))return fetch(base+url,{...opts,headers:{...opts?.headers,Cookie:cookie}});
    if(String(url).includes('/buy')){buyRequests.push(String(url));const price=String(url).includes(st)?variants.find(v=>v.id===st).price_coins:100;if(balance<price)return new Response(JSON.stringify({error:'insufficient_coins'}),{status:409});balance-=price;return new Response(JSON.stringify({ok:true}),{status:200})}
    return new Response('{}',{status:200});
   };
   for(const s of w.document.querySelectorAll('script:not([src])'))w.eval(s.textContent);
   w.d1Confirm=async()=>true;w.eval(client);
   await until(()=>w.document.querySelectorAll('#grid .marketCardActions').length>0&&w.document.querySelector('#grid .marketIcon:not(:disabled)'));
   return w;
  }
  let w=await mount();const q=s=>w.document.querySelector(s),all=s=>[...w.document.querySelectorAll(s)],cards=()=>all('#grid .item');
  assert.equal(cards().length,2);assert.equal(cards()[0].dataset.marketCard,'true');assert.equal(cards()[0].querySelector('.mkt-model').textContent,'AK-47');assert.equal(cards()[0].querySelector('.mkt-finish').textContent,'Test');assert.equal(cards()[0].querySelector('.mkt-currency').textContent,' монет');assert(cards()[0].textContent.includes('Обычный · FT'));assert(cards()[0].querySelector('.coins').textContent.includes('100'));
  q('[data-market-budget="near"]').click();assert.equal(cards().length,1);assert(cards()[0].textContent.includes('AK-47'));
  q('[data-market-budget="affordable"]').click();assert.equal(cards().length,2);assert(cards().some(c=>c.textContent.includes('Sticker')));const affordableSkin=cards().find(c=>c.textContent.includes('AK-47'));assert(affordableSkin.textContent.includes('Обычный · BS'));affordableSkin.querySelector('.buy').click();assert.equal(q('#wears .on').dataset.w,'BS');assert(q('#mp').textContent.includes('60'));q('#close').click();
  q('#reset').click();q('[data-kind="normal"]').checked=true;q('[data-kind="normal"]').dispatchEvent(new w.Event('change',{bubbles:true}));q('[data-market-budget="affordable"]').click();assert(cards().some(c=>c.textContent.includes('Sticker')));q('#reset').click();q('[data-wear="FN"]').checked=true;q('[data-wear="FN"]').dispatchEvent(new w.Event('change',{bubbles:true}));q('[data-kind="stattrak"]').checked=true;q('[data-kind="stattrak"]').dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(cards().length,1);assert(cards()[0].textContent.includes('StatTrak™ · FN'));assert(cards()[0].querySelector('.coins').textContent.includes('200'));
  cards()[0].querySelector('[data-market-action="favorite"]').click();await until(()=>favorites.length===1&&q('#grid .marketIcon:not(:disabled)'));assert.equal(favorites[0].variantId,st);assert.equal(buyRequests.length,0);
  q('#reset').click();cards().find(c=>c.textContent.includes('AK-47')).querySelector('[data-market-action="favorite"]').click();await until(()=>favorites.length===2&&q('#grid .marketIcon:not(:disabled)'));
  q('[data-market-view="favorites"]').click();assert.equal(cards().length,2);assert(cards().some(c=>c.textContent.includes('StatTrak™ · FN')));assert(cards().some(c=>c.textContent.includes('Обычный · FT')));
  cards().find(c=>c.textContent.includes('StatTrak™ · FN')).querySelector('[data-market-action="goal"]').click();await until(()=>goal&&q('#marketGoal .marketProgress'));assert.equal(q('#marketGoal .marketProgress').getAttribute('aria-valuenow'),'40');assert(q('#marketGoal').textContent.includes('StatTrak™ · FN'));assert.equal(buyRequests.length,0);
  w=await mount('?view=favorites');assert.equal(cards().length,2);assert(q('#marketGoal').textContent.includes('StatTrak™ · FN'));
  balance=200;w.dispatchEvent(new w.Event('focus'));await until(()=>q('#marketGoal .marketProgress')?.getAttribute('aria-valuenow')==='100');assert(q('#marketGoal').textContent.includes('Цель достигнута!'));
  q('[data-market-goal-open]').click();assert(q('#modal').classList.contains('on'));assert.equal(q('#tabs .on').dataset.k,'stattrak');assert.equal(q('#wears .on').dataset.w,'FN');assert(q('#mp').textContent.includes('200'));
  q('#addCart').click();q('#cartTop').click();assert(q('#cartList').textContent.includes('StatTrak™ · FN'));assert(q('#cartList').textContent.includes('200'));
  q('#cartClose').click();q('[data-market-goal-open]').click();q('#mb').click();await until(()=>buyRequests.length===1);assert(buyRequests[0].includes('/variant/'+st+'/buy'));await until(()=>q('#bal').textContent.includes('0 Монет'));
  await until(()=>q('#marketGoal').textContent.includes('Осталось')&&q('#marketGoal').getAttribute('aria-busy')!=='true');
  // Current price/stock changes are reflected after refresh, not stored snapshots.
  balance=200;variants.find(v=>v.id===st).price_coins=250;w.dispatchEvent(new w.Event('focus'));await until(()=>q('#marketGoal .marketProgress')?.getAttribute('aria-valuenow')==='80');assert(q('#marketGoal').textContent.includes('250'));await until(()=>q('#marketGoal').getAttribute('aria-busy')!=='true');
  q('#marketSort').value='desc';q('#marketSort').dispatchEvent(new w.Event('change'));assert(cards()[0].textContent.includes('StatTrak™ · FN'));
  q('[data-market-goal-open]').click();assert(q('#mp').textContent.includes('250'));variants.find(v=>v.id===st).price_coins=300;w.dispatchEvent(new w.Event('focus'));await until(()=>q('#mp').textContent.includes('300'));assert.equal(q('#tabs .on').dataset.k,'stattrak');assert.equal(q('#wears .on').dataset.w,'FN');await until(()=>q('#marketGoal').getAttribute('aria-busy')!=='true');q('#close').click();
  variants.find(v=>v.id===st).available=false;w.dispatchEvent(new w.Event('focus'));await until(()=>q('[data-market-goal-open]')?.disabled);assert(cards().find(c=>c.textContent.includes('StatTrak™ · FN')).querySelector('.buy').disabled);assert(q('#marketGoal').textContent.includes('нет в наличии'));
  cards().find(c=>c.textContent.includes('StatTrak™ · FN')).querySelector('[data-market-action="unfavorite"]').click();await until(()=>goal===null&&!q('#marketGoal .marketProgress'));assert.equal(favorites.length,1);
  assert.deepEqual(errors,[]);
 }finally{dom?.window.close();server.kill();mock.closeAllConnections();await new Promise(r=>mock.close(r));}
});
