import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {withSiteNavigation} from '../src/site-navigation.ts';

const page='<!doctype html><html><head><style>main{max-width:900px}</style></head><body><main><nav><a class="brand" href="/account">Dropso</a><a href="/account">← На главную</a></nav><button id="play">Играть</button></main><footer>Old footer</footer></body></html>';

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
