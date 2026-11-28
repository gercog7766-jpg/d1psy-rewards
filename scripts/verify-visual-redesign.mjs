import {chromium} from 'playwright';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {withSiteNavigation} from '../src/site-navigation.ts';
import {withSiteBranding} from '../src/site-branding.ts';
import {withDropsoDashboard} from '../src/dropso-dashboard.ts';
import {withDropsoPagePolish} from '../src/dropso-page-polish.ts';
import {withDropsoRedesign} from '../src/dropso-redesign.ts';
import {withMobileLayout} from '../src/mobile-layout.ts';
import {playerMembershipPreview} from '../src/player-membership.ts';
import {bonusesHtml} from '../src/bonuses-ui.ts';
import {liveBossPage} from '../src/live-boss.ts';
import {streamersHtml} from '../src/streamers-directory-ui.ts';
import {blackBoxPage} from '../src/black-box-ui.ts';
import {redButtonPage} from '../src/red-button-ui.ts';
import {vaultHtml} from '../src/vault-ui.ts';
import {clansHtml} from '../src/clans-ui.ts';
import {customizationHtml} from '../src/profile-customization-ui.ts';
import {shopDesignCss} from '../src/shop-design.ts';
import {pwaIcons} from '../src/pwa-icons.ts';
// Local-only fixture. No production routes, data, sessions or purchases are used.
const shop='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+shopDesignCss+'</style></head><body data-market-design="cards"><main><h1>Магазин</h1><section id="marketGoal"><h2>Моя главная цель</h2></section><div class="layout"><aside id="side"><h3>Цена</h3><div class="price"><input id="lo" placeholder="Цена от"><input id="hi" placeholder="Цена до"></div><h3>Износ</h3><div class="opts"><label><input type="checkbox"> FN</label></div><button id="reset">Сбросить</button></aside><section><div class="marketToolbar">Все скины · Мои желания</div><input id="search" placeholder="Поиск"><div id="grid">'+Array.from({length:12},(_,i)=>'<article class="item"><div class="name">Скин '+(i+1)+'</div><div class="coins">5 монет</div></article>').join('')+'</div></section></div></main></body></html>';
const pages={'/membership':playerMembershipPreview(),'/shop':shop,'/bonuses':bonusesHtml,'/bosses':liveBossPage('player'),'/streamers':streamersHtml,'/black-box':blackBoxPage(false),'/games/red-button':redButtonPage,'/vault':vaultHtml,'/profile/customize':customizationHtml,'/clans':clansHtml(false)};
function render(html,path){
 // Remove feature scripts to avoid live requests; the real shared UI scripts remain.
 html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 return withDropsoRedesign(withDropsoPagePolish(withDropsoDashboard(withSiteNavigation(withMobileLayout(withSiteBranding(html,path),path),path),path),path),path);
}
const browser=await chromium.launch({headless:true});await mkdir('redesign-screenshots',{recursive:true});
try{
 for(const [width,height] of [[1440,1000],[390,844]]){
  const context=await browser.newContext({viewport:{width,height}});
  for(const [path,html] of Object.entries(pages)){
   const page=await context.newPage();const issues=[];
   page.on('pageerror',e=>issues.push(e.message));
   await page.route('**/*',async route=>{
    if(new URL(route.request().url()).hostname!=='preview.test'){await route.abort();return}
    const p=new URL(route.request().url()).pathname;
    if(p===path){await route.fulfill({contentType:'text/html; charset=utf-8',body:render(html,path)});return}
    if(p.startsWith('/api/me/economy')){await route.fulfill({json:{balance:10}});return}
    if(p.startsWith('/pwa/icon/')){const data=pwaIcons[p.split('/').pop().replace(/\.png$/,'')];if(data){await route.fulfill({body:Buffer.from(data,'base64'),contentType:'image/png'});return}}
    if(p==='/black-box/case.jpg'||p==='/games/red-button/button-v1.webp'){const asset=p.endsWith('.jpg')?'public/black-box/dropso-case.jpg':'assets/games/red-button/button-v1.webp';try{await route.fulfill({body:await readFile(asset),contentType:p.endsWith('.jpg')?'image/jpeg':'image/webp'});return}catch{}}
    if(/^\/(?:pwa|live-boss|black-box|games)\//.test(p)){
     const file=resolve('public','.'+p);
     try{const data=await readFile(file);await route.fulfill({body:data,contentType:p.endsWith('.webp')?'image/webp':p.endsWith('.jpg')?'image/jpeg':'image/png'});return}catch{}
    }
    await route.fulfill({status:404,body:''});
   });
   await page.goto('http://preview.test'+path);await page.waitForTimeout(100);
   // Fill visual-only test data for dynamic portions. Do not call any financial or game APIs.
   await page.evaluate(path=>{const el=id=>document.getElementById(id);if(path==='/bonuses'){el('randomClock').textContent='09:41:55';el('dailyBonusText').textContent='Серия 2/7';el('dailyBonusDays').innerHTML=[1,3,5,10,15,25,40].map((v,i)=>'<div class="dailyDay '+(i===1?'on':'')+'">День '+(i+1)+'<strong>+'+v+'</strong></div>').join('')}
    if(path==='/streamers'){el('streamerGrid').innerHTML=Array.from({length:7},(_,i)=>'<a class="streamer-card" href="#"><div class="streamer-avatar"><span>DS</span></div><div class="streamer-info"><strong>Streamer '+(i+1)+'</strong><div class="streamer-login">twitch.tv/demo'+(i+1)+'</div><div class="streamer-status">Офлайн</div></div><span class="streamer-arrow">↗</span></a>').join('')}
    if(path==='/clans'){el('content').innerHTML='<section class="panel"><h2>Сезон кланов · CLAN POINTS</h2><div class="clan-podium"><div class="clan-podium-place"><b>1</b><span>1 500 монет</span></div><div class="clan-podium-place"><b>2</b><span>750 монет</span></div><div class="clan-podium-place"><b>3</b><span>250 монет</span></div></div><div class="clan-list-grid">'+['Demo Clan A','Demo Clan B'].map(n=>'<article class="card clan-list-row"><img class="avatar" src="/pwa/icon/brand-logo.png" alt=""><strong>'+n+'</strong><span class="clan-lvl">LVL 1</span><div class="clan-row-actions"><button>Открыть</button></div></article>').join('')+'</div></section>'}
   },path);
   assert.equal(await page.locator('body').getAttribute('data-dropso-redesign'),path==='/membership'?'premium':await page.locator('body').getAttribute('data-dropso-page'));
   assert.equal(await page.locator('#dropsoRedesign').count(),1);
   assert.equal(issues.length,0,path+': '+issues.join('; '));
   if(path==='/shop'){assert.equal(await page.locator('.dropso-shop-filter-row #search').count(),1);assert.equal(await page.locator('.dropso-shop-filter-row #lo').count(),1)}
   if(path==='/bosses'){assert.equal(await page.locator('.dropso-raid-link').count(),1)}
   if(width===1440&&path!=='/shop'){const toggle=page.locator('.dropso-redesign-collapse');assert.equal(await toggle.count(),1);await toggle.click();assert(await page.locator('body').evaluate(el=>el.classList.contains('dropso-redesign-collapsed')));await toggle.click()}
   const main=page.locator('main').first();if(await main.count()){const b=await main.boundingBox();assert(b&&b.width<=width+2,path+' main exceeds viewport')};
   await page.screenshot({path:'redesign-screenshots/'+path.slice(1).replaceAll('/','-')+'-'+width+'.png',fullPage:true});await page.close();
  }
  await context.close();
 }
}finally{await browser.close()}
console.log('Desktop and mobile fixture screenshots complete');
