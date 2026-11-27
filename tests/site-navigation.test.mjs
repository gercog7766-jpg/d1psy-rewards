import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {withSiteNavigation} from '../src/site-navigation.ts';
import {withDropsoDashboard} from '../src/dropso-dashboard.ts';
import {withDropsoPagePolish,dropsoPageKind} from '../src/dropso-page-polish.ts';

test('page polish is scoped to the expected route and keeps layout hooks untouched',()=>{
 const routes=[['/account','account'],['/shop','shop'],['/upgrader','upgrader'],['/games','games'],['/games/minesweeper','game'],['/games/red-button','red-button'],['/predict/major-pickem','major'],['/predict','predict'],['/bosses/partners','boss'],['/black-box','auction'],['/vault','vault'],['/advent','advent'],['/season','season'],['/clans/one','clans'],['/streamers','streamers'],['/streamer/live','streamer'],['/users/viewer','users'],['/community','messages'],['/statistics','statistics'],['/level','level'],['/profile/customize','profile'],['/bonuses','bonuses'],['/savings','savings'],['/referrals','referrals'],['/notifications','notifications'],['/suggestions','suggestions'],['/admin/streamers','admin'],['/rules','legal']];
 const source='<!doctype html><html><head></head><body data-dropso-shell><main><button id="apply">Применить</button><div id="grid" class="grid"></div></main><script>var source="<main>";</script></body></html>';
 for(const [path,kind]of routes){assert.equal(dropsoPageKind(path),kind,path);const html=withDropsoPagePolish(source,path);assert.equal(withDropsoPagePolish(html,path),html);const dom=new JSDOM(html);try{const d=dom.window.document;assert.equal(d.body.dataset.dropsoPage,kind);assert.equal(d.querySelectorAll('#dropsoPagePolish').length,1);assert.equal(d.querySelector('#apply').textContent,'Применить');assert.equal(d.querySelector('#grid').className,'grid');assert.equal(d.querySelector('script').textContent,'var source="<main>";')}finally{dom.window.close()}}
 for(const path of ['/obs','/obs/boss','/streamer/obs','/api/me','/auth/twitch','/partner-live.js'])assert.equal(withDropsoPagePolish(source,path),source,path);
});

test('dashboard groups real event links and live banners without replacing interactive nodes',async()=>{
 const ids=['bossAccountHero','adventAccountHero','majorPickemBanner','vaultAccountHero','seasonAccountHero','clanAccountHero'];
 const original='<!doctype html><html><head></head><body data-account-design="neon"><main>'+ids.map(id=>`<a id="${id}" class="seasonAccountHero" href="/bosses"><span class="seasonAccountTitle">${id}</span></a>`).join('')+'<section id="dropsoLiveEvents" hidden></section><section id="liveBoostBanner" hidden></section><b id="coinBalance">50</b><div id="inventory"></div></main></body></html>';
 const html=withDropsoDashboard(withSiteNavigation(original,'/account'),'/account');assert.equal(withDropsoDashboard(html,'/account'),html);
 const dom=new JSDOM(html,{url:'https://dropso.test/account',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,d=w.document;w.matchMedia=()=>({matches:true,addEventListener(){}});
 try{const boss=d.getElementById(ids[0]);let clicked=0;boss.addEventListener('click',e=>{e.preventDefault();clicked++});w.eval(d.getElementById('dropsoDashboardScript').textContent);await new Promise(r=>setTimeout(r,40));assert.deepEqual([...d.querySelector('.dashboard-events').children].map(n=>n.id),ids.filter(id=>id!=='majorPickemBanner'));assert.equal(d.querySelector('.dashboard-events').nextElementSibling.id,'majorPickemBanner');assert.equal(d.querySelector('.dashboard-events').firstElementChild,boss);boss.click();assert.equal(clicked,1);assert.equal(d.querySelector('.dashboard-live-strip').children.length,2);assert.match(d.querySelector('.dashboard-header-balance').textContent,/50/);d.getElementById('coinBalance').textContent='65 Монет';await Promise.resolve();assert.equal(d.querySelector('.dashboard-header-balance').textContent,'● 65 монет')}finally{w.close()}
});

const page='<!doctype html><html><head><style>main{max-width:900px}</style></head><body><main><nav><a class="brand" href="/account">Dropso</a><a href="/account">← На главную</a></nav><button id="play">Играть</button></main><footer>Old footer</footer></body></html>';

test('account dashboard does not create a duplicate horizontal navigation',async()=>{
 const source=page.replace('<main>','<main><div id="bossAccountHero"></div>');
 const dom=new JSDOM(withDropsoDashboard(withSiteNavigation(source,'/account'),'/account'),{url:'https://dropso.test/account',runScripts:'outside-only',pretendToBeVisual:true});
 try{const w=dom.window,d=w.document;w.eval(d.getElementById('dropsoDashboardScript').textContent);await new Promise(r=>setTimeout(r,40));assert(d.querySelector('.dashboard-events'));assert.equal(d.querySelector('.dashboard-tabs'),null)}finally{dom.window.close()}
});

test('shared navigation preserves page nodes and actions, marks the most specific route, and is idempotent',()=>{
 const html=withSiteNavigation(page,'/games/three-doors');
 assert.equal(withSiteNavigation(html,'/games/three-doors'),html);
 const dom=new JSDOM(html,{url:'https://example.test/games/three-doors',runScripts:'outside-only'});
 try{
  const {window:w}=dom,doc=w.document,main=doc.querySelector('main'),button=doc.getElementById('play');
  let clicks=0;button.onclick=()=>clicks++;
  w.eval(doc.getElementById('dropsoSiteNavigationScript').textContent);
  doc.dispatchEvent(new w.Event('DOMContentLoaded'));
  assert.equal(doc.querySelector('.dropso-site-layout>main'),main);
  button.click();assert.equal(clicks,1);
  assert.equal(doc.querySelectorAll('footer').length,1);
  assert.equal(doc.querySelector('footer .footer-social a').getAttribute('href'),'https://t.me/dropso_cs2');
  assert.equal(doc.querySelectorAll('footer .footer-social a').length,1);
  assert.equal(doc.querySelector('footer a[href*="twitch.tv"]'),null);
  assert.equal(doc.querySelectorAll('.dropso-home').length,1);
  assert.equal(doc.querySelector('.dropso-home img').getAttribute('src'),'/pwa/icon/brand-logo.png');
  assert.equal(doc.querySelector('a[aria-current]').getAttribute('href'),'/games/three-doors');
  assert.equal(doc.querySelectorAll('#dropsoSiteSidebar a[href="/games"]').length,1);
 }finally{dom.window.close()}
});

test('shop and upgrader keep full-width content with reciprocal navigation, including existing footers',()=>{
 for(const [path,target] of [['/shop','/upgrader'],['/upgrader','/shop']]){
  const dom=new JSDOM(withSiteNavigation(page,path));
  try{
   assert.equal(dom.window.document.querySelector('#dropsoSiteSidebar'),null);
   assert.equal(dom.window.document.querySelector('.dropso-site-shortcuts a').getAttribute('href'),target);
   assert.equal(dom.window.document.querySelectorAll('footer').length,1);
  }finally{dom.window.close()}
 }
});

test('document decoration preserves embedded templates and excludes OBS and API documents',()=>{
 const embedded='<script>const template="<footer>template</footer>";</script>';
 assert(withSiteNavigation(page.replace('</body>',embedded+'</body>'),'/vault').includes(embedded));
 for(const path of ['/obs','/streamer/obs','/api/example'])assert.equal(withSiteNavigation(page,path),page);
 for(const path of ['/privacy','/rules','/terms','/admin/vault','/']){
  const dom=new JSDOM(withSiteNavigation(page,path));
  try{assert(dom.window.document.querySelector('.dropso-home'));assert(dom.window.document.querySelector('footer'))}
  finally{dom.window.close()}
 }
});

test('mobile page navigation uses an icon in the header and keeps all links accessible',()=>{
 const dom=new JSDOM(withSiteNavigation(page,'/clans'),{runScripts:'outside-only'}),w=dom.window,d=w.document;
 try{w.eval(d.getElementById('dropsoSiteNavigationScript').textContent);d.dispatchEvent(new w.Event('DOMContentLoaded'));const toggle=d.getElementById('dropsoSiteMenuToggle'),details=d.querySelector('#dropsoSiteSidebar details');assert(toggle.querySelector('svg'));assert.equal(toggle.textContent,'');assert.equal(toggle.getAttribute('aria-expanded'),'false');toggle.click();assert(details.open);assert.equal(toggle.getAttribute('aria-expanded'),'true');assert(d.querySelector('#dropsoSiteSidebar a[href="/clans"]'));toggle.click();assert(!details.open)}finally{w.close()}
});

test('all sidebar pages share the account order, separated social, activity and event groups',()=>{
 const expected=[
  ['/account','/level','/bonuses','/statistics','/profile/customize','/referrals','/savings'],
  ['/users','/community','/notifications'],
  ['/shop','/upgrader','/games/battles','/games/three-doors','/games/pick','/games','/predict','/bosses','/challenges','/streamers','/suggestions','/clans','/black-box','/games/red-button'],
  ['/predict/major-pickem','/advent','/vault','/season'],
 ];
 for(const path of ['/vault','/bosses','/challenges','/level','/users/player','/profile/customize','/notifications','/predict/major-pickem']){
  const dom=new JSDOM(withSiteNavigation(page,path));
  try{
   const d=dom.window.document,groups=[...d.querySelectorAll('#dropsoSiteSidebar .dropso-nav-group')];
   assert.deepEqual(groups.map(group=>[...group.querySelectorAll('a')].map(a=>a.getAttribute('href'))),expected,path);
   assert.equal(d.querySelectorAll('#dropsoSiteSidebar a[aria-current="page"]').length,1,path);
   assert.equal(d.querySelector('#dropsoSiteSidebar a[aria-current="page"]').getAttribute('href'),path==='/users/player'?'/users':path);
   assert.equal(new Set(expected.flat()).size,expected.flat().length);
   assert.match(d.getElementById('dropsoSiteNavigationStyle').textContent,/\.dropso-nav-group\+\.dropso-nav-group\{[^}]*border-top:/);
  }finally{dom.window.close()}
 }
});

test('account mobile hamburger moves to shared header and duplicate menu label is removed',()=>{
 const html=withSiteNavigation(page.replace('<main>','<main><div id="identity"><button id="mobileMenuToggle">☰</button><button id="accountLogoMenuToggle">Меню</button></div>'),'/account');
 const dom=new JSDOM(html,{runScripts:'outside-only'}),w=dom.window,d=w.document;let change;const media={matches:true,addEventListener:(_,fn)=>change=fn};w.matchMedia=()=>media;
 try{w.eval(d.getElementById('dropsoSiteNavigationScript').textContent);d.dispatchEvent(new w.Event('DOMContentLoaded'));assert(d.querySelector('.dropso-site-header #mobileMenuToggle'));assert.equal(d.getElementById('accountLogoMenuToggle').textContent,'');assert(d.querySelector('#accountLogoMenuToggle svg'));media.matches=false;change();assert(d.querySelector('#identity #mobileMenuToggle'))}finally{w.close()}
});
