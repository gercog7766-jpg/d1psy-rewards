import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
import {withDropsoRedesign} from '../src/dropso-redesign.ts';
import {withSiteNavigation} from '../src/site-navigation.ts';
const html='<!doctype html><html><head></head><body><main><button id="action">Действие</button></main></body></html>';
test('redesign is route scoped and idempotent, keeps original control IDs and excludes admin/OBS/API',()=>{
 for(const path of ['/account','/membership','/shop','/bonuses','/bosses','/streamers','/black-box','/games/red-button','/vault','/profile/customize','/clans']){
  const before=withSiteNavigation(html,path),after=withDropsoRedesign(before,path);
  assert.match(after,/id="dropsoRedesign"/);assert.match(after,/id="action"/);assert.equal(withDropsoRedesign(after,path),after);
 }
 for(const path of ['/admin','/admin/bosses','/obs/boss','/api/me','/']){const before=withSiteNavigation(html,path);assert.equal(withDropsoRedesign(before,path),before)}
});

test('sidebar retains its routes, displays server-supplied balance, and collapses without destroying controls',async()=>{
 const dom=new JSDOM(withDropsoRedesign(withSiteNavigation(html,'/bosses'),'/bosses'),{url:'https://dropso.site/bosses',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document;w.fetch=async()=>({ok:true,json:async()=>({balance:10})});
 try{w.eval(d.getElementById('dropsoSiteNavigationScript').textContent);w.eval(d.getElementById('dropsoRedesignScript').textContent);d.dispatchEvent(new w.Event('DOMContentLoaded'));await new Promise(r=>setTimeout(r,35));
  const side=d.getElementById('dropsoSiteSidebar'),toggle=side.querySelector('.dropso-redesign-collapse');assert(side.querySelector('a[href="/membership"]'));assert.match(side.querySelector('.dropso-redesign-balance').textContent,/10 мон/);assert(side.querySelector('a[href="/vault"]'));toggle.click();assert(d.body.classList.contains('dropso-redesign-collapsed'));toggle.click();assert(!d.body.classList.contains('dropso-redesign-collapsed'));assert(d.getElementById('action'));assert.equal(side.querySelectorAll('.dropso-redesign-premium').length,1);
 }finally{w.close()}
});

test('shop moves existing search and filters into top toolbar without replacing interactive inputs',()=>{
 const shopHtml=html.replace('<button id="action">Действие</button>','<div class="layout"><aside id="side"><h3>Цена</h3><div class="price"><input id="lo"><input id="hi"></div><h3>Износ</h3><div class="opts"><input id="wear" type="checkbox"></div></aside><section><input id="search"><div id="grid"></div></section></div>');
 const dom=new JSDOM(withDropsoRedesign(withSiteNavigation(shopHtml,'/shop'),'/shop'),{url:'https://dropso.site/shop',runScripts:'outside-only',pretendToBeVisual:true});try{const w=dom.window,d=w.document,lo=d.getElementById('lo'),wear=d.getElementById('wear'),search=d.getElementById('search');w.eval(d.getElementById('dropsoRedesignScript').textContent);d.dispatchEvent(new w.Event('DOMContentLoaded'));assert.equal(d.querySelector('.dropso-shop-filter-row #search'),search);assert.equal(d.querySelector('.dropso-shop-filter-row #lo'),lo);assert.equal(d.querySelector('.dropso-shop-filter-extra #wear'),wear);assert(d.querySelector('.layout>section>#side'));}finally{dom.window.close()}
});

test('designer sidebar uses the same ordered groups and SVG icons, preserving live account controls',async()=>{
 const fixture='<!doctype html><html><head></head><body data-dropso-shell data-account-design="neon"><nav class="desktop-account-sidebar"><a class="desktop-account-brand" href="/account">Dropso</a><div class="desktop-account-group"><button class="logo-menu-balance"><span class="account-menu-label">Баланс</span><strong>10 монет</strong></button><button id="d1PwaOpen">Приложение</button></div><div class="desktop-account-group"><a id="messagesTopLink" href="/community">Сообщения<span id="messagesUnreadDot">2</span></a></div><div class="desktop-account-group"><a href="/shop">Магазин</a></div></nav><main></main></body></html>';
 const routes=[['/level','Dropso LEVEL'],['/account#application','Приложение'],['/games/red-button','Красная кнопка'],['/vault','THE VAULT']];
 for(const path of ['/account','/bonuses']){const dom=new JSDOM(withDropsoRedesign(path==='/account'?fixture:withSiteNavigation(html,path),path),{url:'https://dropso.site'+path,runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,d=w.document,app=d.getElementById('d1PwaOpen'),dot=d.getElementById('messagesUnreadDot');w.fetch=async()=>({ok:true,json:async()=>({balance:10})});try{w.eval(d.getElementById('dropsoRedesignScript').textContent);d.dispatchEvent(new w.Event('DOMContentLoaded'));await new Promise(r=>setTimeout(r,35));const side=d.querySelector('[data-ref-menu]');assert.equal(side.querySelectorAll('.dropso-menu-section-title').length,4);assert.equal(side.querySelectorAll('.dropso-menu-row').length,30);assert.equal(side.querySelectorAll('.dropso-menu-row .dashboard-icon svg').length,30);assert.equal(side.querySelectorAll('.dropso-menu-event').length,4);for(const [href,label]of routes)assert.equal(side.querySelector('[data-menu-key="'+href+'"]').getAttribute('aria-label'),label);if(app){assert.equal(d.getElementById('d1PwaOpen'),app);assert.equal(d.getElementById('messagesUnreadDot'),dot);assert.equal(side.querySelector('[data-menu-key="/account#application"]'),app)}assert.equal(side.querySelectorAll('.dropso-redesign-premium').length,1);side.querySelector('.dropso-redesign-collapse').click();assert(d.body.classList.contains('dropso-redesign-collapsed'));assert.equal(side.querySelectorAll('.dropso-menu-row').length,30)}finally{w.close()}}
});
