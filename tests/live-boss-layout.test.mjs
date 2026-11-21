import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {liveBossPage,liveBossScript,bossDonationPage} from '../src/live-boss.ts';
import {withSiteNavigation} from '../src/site-navigation.ts';
import {withSiteBranding} from '../src/site-branding.ts';
import {withMobileLayout} from '../src/mobile-layout.ts';
import {withMobileBottomBar} from '../src/mobile-bottom-bar.ts';
import {withSiteScrollbars} from '../src/site-scrollbars.ts';
const decorate=(html,path)=>withSiteNavigation(withSiteScrollbars(withMobileLayout(withSiteBranding(withMobileBottomBar(html,path),path),path),path),path);
for(const [mode,path] of [['player','/bosses'],['admin','/admin/bosses'],['obs','/obs/boss']])test('boss document has one styled layout and correct mode: '+mode,()=>{
 const html=decorate(liveBossPage(mode),path);
 assert.equal(decorate(html,path),html);
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://dropso.site'+path});
 try{const w=dom.window,d=w.document;
  assert.equal(d.body.dataset.bossMode,mode);assert(d.querySelector('head meta[name="viewport"]'));
  if(mode==='obs'){assert.equal(d.querySelector('.dropso-site-header'),null);assert.equal(d.querySelector('footer'),null)}
  else{assert.equal(d.querySelectorAll('.dropso-site-header').length,1);assert.equal(d.querySelectorAll('footer').length,1);assert(d.head.querySelector('#dropsoSiteNavigationStyle'));assert(d.head.querySelector('#d1psyFooterStyles'));assert.equal(d.querySelectorAll('#bossIdle article').length,3)}
  if(mode==='player'){assert(d.querySelector('#dropso-mobile-bar'));assert(d.querySelector('#dropsoSiteSidebar a[href="/bosses"][aria-current="page"]'));assert(d.querySelector('#copyCode'));w.eval(d.querySelector('#dropsoSiteNavigationScript').textContent);d.dispatchEvent(new w.Event('DOMContentLoaded'));assert(d.querySelector('.dropso-site-layout>main'))}
  if(mode==='admin'){assert(d.querySelector('a[href="/admin/bosses/twitch"]'));assert(d.querySelector('a[href="/admin"]'));assert.equal(d.querySelectorAll('[data-action]').length,6);assert(d.querySelector('[data-action="disable"]'));assert(d.querySelector('[data-action="switch"]'));for(const id of ['twitchStatus','daStatus','ihaqStatus'])assert.equal(d.getElementById(id).dataset.state,'checking');assert(d.querySelector('#ihaqReconnect'))}
 }finally{dom.window.close()}
});
test('implicit HTML head is decorated exactly once',()=>{
 const path='/bosses',html='<!doctype html><html><meta charset="utf-8"><body><main>Test</main></body></html>';
 const decorated=withSiteNavigation(html,path);assert.equal(withSiteNavigation(decorated,path),decorated);
 const dom=new JSDOM(decorated);try{assert(dom.window.document.head.querySelector('#dropsoSiteNavigationStyle'));assert.equal(dom.window.document.querySelectorAll('.dropso-site-header').length,1)}finally{dom.window.close()}
});
test('provider cards render green, failure and reconnect status from owner API',async()=>{
 const dom=new JSDOM(liveBossPage('admin'),{runScripts:'outside-only',url:'https://dropso.test/admin/bosses'}),w=dom.window;
 try{w.fetch=async()=>({ok:true,json:async()=>({boss:null,donations:[],twitch:{status:'connected',details:'2 из 2 событий подписок'},donationAlerts:{status:'reconnect_required'},ihaq:{status:'disconnected'}})});w.eval(liveBossScript);
 const d=w.document;for(let i=0;i<50&&d.getElementById('twitchStatus').dataset.state!=='connected';i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(d.getElementById('twitchStatus').textContent,'Подключён');assert.equal(d.getElementById('daStatus').dataset.state,'reconnect_required');assert.equal(d.getElementById('ihaqStatus').textContent,'Нет связи');assert.equal(d.getElementById('twitchConnect').textContent,'Переподключить');
 }finally{w.close()}
});
test('free attack is locked without confirmed presence and shows frozen cooldown',async()=>{
 const dom=new JSDOM(liveBossPage('player'),{runScripts:'outside-only',url:'https://dropso.test/bosses'}),w=dom.window;
 try{const d=w.document;let present=false,cooldown=600;let refresh;
 w.setInterval=fn=>{refresh=fn;return 1};
 w.fetch=async()=>({ok:true,json:async()=>({boss:{name:'DROPSY',image:'/live-boss/756.webp',hp:5000,max_hp:5000,status:'active'},damage:0,cooldown,present,live:true,streamLogin:'owner',code:'code'})});w.eval(liveBossScript);
 const until=async expected=>{for(let i=0;i<50&&!d.getElementById('cooldownStatus').textContent.includes(expected);i++)await new Promise(r=>setTimeout(r,5));assert.match(d.getElementById('cooldownStatus').textContent,new RegExp(expected))};
 await until('заморожен');assert(d.getElementById('attack').disabled);assert.equal(d.getElementById('bossStreamLink').href,'https://www.twitch.tv/owner');
 present=true;await refresh();await until('восстанавливается');assert(d.getElementById('attack').disabled);
 cooldown=0;await refresh();await until('Атака доступна');assert.equal(d.getElementById('attack').disabled,false);
 }finally{w.close()}
});
test('manual donation form has only provider, Twitch login and amount; resolves ambiguous existing hits without sending a new donation',async()=>{
 const dom=new JSDOM(bossDonationPage(),{runScripts:'outside-only',url:'https://dropso.test/admin/bosses/donation'}),w=dom.window,d=w.document;
 try{const f=d.getElementById('f'),calls=[];const hit={id:'existing-hit',donor:'Another nick',at:'2026-11-21T10:00:00Z',kind:'dropsy',damage:200,linked:false};
  w.fetch=async(_url,opts)=>{const body=JSON.parse(opts.body);calls.push(body);return {ok:true,json:async()=>body.hitId?{ok:true,damage:200,already:false}:{candidates:[hit,{...hit,id:'other-hit',linked:true}]}}};
  w.eval(d.querySelector('script').textContent);assert.deepEqual([...f.querySelectorAll('[name]')].map(el=>el.name),['source','login','rub']);f.elements.login.value='alpha';f.elements.rub.value='100';
  await f.onsubmit({preventDefault(){}});assert.equal(calls.length,1);assert.equal(d.getElementById('candidateField').hidden,false);assert(d.getElementById('candidate').options[2].disabled);d.getElementById('candidate').value='existing-hit';
  await f.onsubmit({preventDefault(){}});assert.deepEqual(calls[1],{source:'ihaq',login:'alpha',rub:100,hitId:'existing-hit'});assert.match(d.getElementById('result').textContent,/HP босса не изменилось/);
 }finally{w.close()}
});
