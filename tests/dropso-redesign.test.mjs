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
