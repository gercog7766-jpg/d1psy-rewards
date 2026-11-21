import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {liveBossPage} from '../src/live-boss.ts';
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
  if(mode==='admin'){assert(d.querySelector('a[href="/admin/bosses/twitch"]'));assert(d.querySelector('a[href="/admin"]'));assert.equal(d.querySelectorAll('[data-action]').length,4)}
 }finally{dom.window.close()}
});
test('implicit HTML head is decorated exactly once',()=>{
 const path='/bosses',html='<!doctype html><html><meta charset="utf-8"><body><main>Test</main></body></html>';
 const decorated=withSiteNavigation(html,path);assert.equal(withSiteNavigation(decorated,path),decorated);
 const dom=new JSDOM(decorated);try{assert(dom.window.document.head.querySelector('#dropsoSiteNavigationStyle'));assert.equal(dom.window.document.querySelectorAll('.dropso-site-header').length,1)}finally{dom.window.close()}
});
