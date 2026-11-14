import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {spawn} from 'node:child_process';import {createHmac,randomUUID as uuid} from 'node:crypto';import {JSDOM} from 'jsdom';
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(f){for(let i=0;i<400;i++){if(f())return;await pause(20)}assert(f(),'UI condition timeout')}
test('upgrader reads the entire ledger, slider increases chance, refreshes after debit and recovers visibly from balance failures',{timeout:60000},async()=>{
 const user=uuid(),source=uuid(),item=uuid(),variant=uuid(),upgrade=uuid(),secondSource=uuid(),secondItem=uuid(),secondVariant=uuid();let failPage=false,spent=0,rpc=null;const pages=[];
 const ledger=Array.from({length:1028},(_,i)=>({id:uuid(),amount:i<1000?(i%2?1:-1):10}));
 const mock=http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');const url=new URL(req.url,'http://test');
 if(url.pathname.endsWith('/rewards_users'))return res.end(JSON.stringify({id:user,twitch_login:'viewer'}));
 if(url.pathname.endsWith('/rewards_coin_transactions')){assert.equal(url.searchParams.get('user_id'),'eq.'+user);const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);pages.push({offset,limit});if(failPage&&offset>=500){res.statusCode=503;return res.end(JSON.stringify({code:'db_unavailable',message:'test failure'}))}return res.end(JSON.stringify([...ledger,...(spent?[{id:uuid(),amount:-spent}]:[])].slice(offset,offset+limit)))}
 if(url.pathname.endsWith('/rewards_wins'))return res.end(JSON.stringify([{id:source,rewards_prizes:{name:'MP9 | Test',sell_price_coins:5}},{id:secondSource,rewards_prizes:{name:'MP7 | Test',sell_price_coins:8}}]));
 if(url.pathname.endsWith('/rewards_shop_item_variants'))return res.end(JSON.stringify([{id:variant,shop_item_id:item,wear:'BS',variant_kind:'normal',price_coins:35,available:true,rewards_shop_items:{name:'M4A1-S | Test',status:'available'}},{id:secondVariant,shop_item_id:secondItem,wear:'FN',variant_kind:'normal',price_coins:40,available:true,rewards_shop_items:{name:'USP | Test',status:'available'}}]));
 if(url.pathname.endsWith('/rewards_upgrades'))return res.end('null');
 if(/\/rpc\/rewards_run_skin_upgrade(?:_multi)?$/.test(url.pathname)){let text='';for await(const c of req)text+=c;rpc=JSON.parse(text);spent=rpc.p_extra_coins;return res.end(JSON.stringify({id:upgrade,result:'lost',chance_bps:3857,roll_bps:9000}))}
 return res.end('[]')});await new Promise(r=>mock.listen(0,'127.0.0.1',r));const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));const base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['--import','tsx','src/server-entry.ts'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),APP_URL:base,SESSION_SECRET:'upgrader-balance-test',SUPABASE_URL:'http://127.0.0.1:'+mock.address().port,SUPABASE_SECRET_KEY:'test',REWARDS_ENGINE_ENABLED:'false',TWITCH_CLIENT_ID:'',TWITCH_EVENTSUB_SECRET:''},stdio:'ignore'});
 const p=Buffer.from(JSON.stringify({twitchUserId:'viewer',exp:Date.now()+120000})).toString('base64url'),cookie='rewards_session='+p+'.'+createHmac('sha256','upgrader-balance-test').update(p).digest('base64url');let dom;
 try{let ready=false;for(let i=0;i<300;i++){try{const health=await fetch(base+'/health');if(health.ok){await health.text();ready=true;break}}catch{}if(child.exitCode!==null)break;await pause(40)}assert(ready,'Upgrader test server did not become ready');assert.equal((await fetch(base+'/api/me/upgrader/balance')).status,401);
 const result=await fetch(base+'/api/me/upgrader/balance?user_id='+uuid(),{headers:{Cookie:cookie}});assert.equal(result.status,200);assert.equal((await result.json()).balance,280);assert(result.headers.get('cache-control').includes('no-store'));assert.deepEqual(pages.slice(0,3),[{offset:0,limit:500},{offset:500,limit:500},{offset:1000,limit:500}]);
 failPage=true;const failure=await fetch(base+'/api/me/upgrader/balance',{headers:{Cookie:cookie}});assert.equal(failure.status,503);assert.deepEqual(await failure.json(),{error:'balance_load_failed'});
 const html=await(await fetch(base+'/upgrader',{headers:{Cookie:cookie}})).text(),client=await(await fetch(base+'/upgrader.js')).text();dom=new JSDOM(html,{url:base+'/upgrader',runScripts:'outside-only'});const w=dom.window,q=id=>w.document.getElementById(id);w.alert=()=>{};w.localStorage.setItem('d1psy_upgrader_fast_spin','1');w.fetch=(path,opts={})=>fetch(base+path,{...opts,headers:{...opts.headers,Cookie:cookie}});w.eval(client);
 await until(()=>q('inv').querySelector('[data-s]')&&q('coinBalance').textContent==='Баланс недоступен');assert(!q('coinBalanceRetry').hidden);q('inv').querySelector('[data-s]').click();q('targets').querySelector('[data-t]').click();assert(q('coinBoostRange').disabled);
 failPage=false;q('coinBalanceRetry').click();await until(()=>q('coinBalance').textContent==='Баланс: 280 Монет');assert.equal(q('coinBoostRange').disabled,false);assert.equal(q('coinBoostRange').max,'29');assert.equal(q('pct').textContent,'12.9%');q('coinBoostRange').value='10';q('coinBoostRange').dispatchEvent(new w.Event('input'));assert.equal(q('coinBoostValue').textContent,'10 Монет');assert.equal(q('pct').textContent,'38.6%');assert.equal(q('go').disabled,false);q('coinBoostRange').value='29';q('coinBoostRange').dispatchEvent(new w.Event('input'));assert.equal(q('pct').textContent,'85.0%');q('coinBoostRange').value='10';q('coinBoostRange').dispatchEvent(new w.Event('input'));
 await q('go').onclick();assert(rpc);assert.equal(rpc.p_user_id,user);assert.equal(rpc.p_extra_coins,10);await until(()=>q('coinBalance').textContent==='Баланс: 270 Монет');assert.equal(q('coinBoostRange').value,'0');assert.equal(q('coinBoostValue').textContent,'0 Монет');assert.equal(q('source').textContent,'Предмет не выбран');
 // A valid zero balance is distinct from an unavailable balance.
 ledger.splice(0,ledger.length);spent=0;q('coinBalanceRetry').click();await until(()=>q('coinBalance').textContent==='Баланс: 0 Монет');assert(q('coinBalanceRetry').hidden);q('inv').querySelector('[data-s]').click();q('targets').querySelector('[data-t]').click();assert(q('coinBoostRange').disabled);assert.equal(q('coinBoostRange').max,'0');
 ledger.push({amount:-100});q('coinBalanceRetry').click();
 await until(()=>q('coinBalance').textContent==='Баланс: -100 Монет');
 assert(q('coinBalanceRetry').hidden);assert(q('coinBoostRange').disabled);assert.equal(q('go').disabled,false);
 rpc=null;await q('go').onclick();assert(rpc);assert.equal(rpc.p_extra_coins,0);
 await until(()=>q('source').textContent==='Предмет не выбран');
 const pick=(side,id)=>w.document.querySelector('[data-'+side+'="'+id+'"]').click();
 for(const [sourceIds,targetIds] of [[[source],[variant,secondVariant]],[[source,secondSource],[variant]],[[source,secondSource],[variant,secondVariant]]]){
  sourceIds.forEach(id=>pick('s',id));targetIds.forEach(id=>pick('t',id));
  assert.equal(q('source').querySelectorAll('.skin-preview img').length,sourceIds.length);
  assert.equal(q('target').querySelectorAll('.skin-preview img').length,targetIds.length);
  rpc=null;await q('go').onclick();assert(rpc);
  assert.deepEqual(rpc.p_source_win_ids,sourceIds);assert.deepEqual(rpc.p_target_variant_ids,targetIds);assert.equal(rpc.p_extra_coins,0);
  await until(()=>q('source').textContent==='Предмет не выбран');
 }
 }finally{dom?.window.close();if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}await new Promise(r=>mock.close(r))}
});
