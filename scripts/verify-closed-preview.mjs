import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {membershipPageHtml,membershipPageJs} from '../src/membership-page.ts';
import {s2DesignHtml,s2DesignJs} from '../src/s2-design-preview.ts';
import {seasonTwoRewardDraft,seasonTwoThresholds} from '../src/season-two-draft.ts';
const root='https://preview.invalid';
const rows=seasonTwoRewardDraft().flatMap((pair,i)=>['free','premium'].map(track=>({level:i+1,track,...pair[track],image:null})));
const tier='lite',catalog={testOnly:true,rows,thresholds:seasonTwoThresholds,startsAt:'2026-12-14T21:00:00Z',endsAt:'2027-03-14T21:00:00Z',tier,prices:{free:499,lite:489,plus:474}};
const draft={config:{lite:{stars:249,visibility:'hidden'},plus:{stars:399,visibility:'hidden'}}};
const stars={entitlements:{tier,expiresAt:new Date(Date.now()+30*86400000).toISOString()},control:{enabled:false,fulfillment_ready:true,support_url:'https://t.me/dropso_cs2'},linked:true,relayConfigured:true,botUsername:'dropso_test_bot'};
const mission={label:'Угадай слово в Wordly',sp:125,target:1,unit:'count'},group={tasks:[mission],mask:0,replaced:false};
const progress={testOnly:true,revision:1,day:1,premium:false,progress:{level:1,sp:1325,weekly:2,challenges:0,remainingDaily:90,remainingWeekly:109,remainingChallenges:9},state:{receipts:[],days:{1:group},weeks:{1:group},months:[group],metrics:{d1:[{progress:0}],w1:[{progress:0}],m1:[{progress:0}]}}};
await mkdir('preview-screenshots',{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for(const viewport of [{width:1440,height:1024},{width:390,height:844},{width:320,height:700}]){
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==root)return route.abort();
   const p=url.pathname;
   const send=(body,contentType='text/html')=>route.fulfill({status:200,body,contentType});
   const json=value=>send(JSON.stringify(value),'application/json');
   if(p==='/admin/monetization/membership-page')return send(membershipPageHtml);
   if(p==='/api/admin/monetization/membership-page-script')return send(membershipPageJs,'application/javascript');
   if(p==='/api/admin/monetization/draft')return json(draft);
   if(p==='/api/admin/monetization/stars')return json(stars);
   if(p==='/admin/monetization/s2-design')return send(s2DesignHtml);
   if(p==='/api/admin/monetization/s2-design-script')return send(s2DesignJs,'application/javascript');
   if(p==='/api/admin/monetization/s2-design')return json(catalog);
   if(p==='/api/admin/monetization/s2-real')return json(progress);
   if(p==='/pwa/icon/brand-logo.png')return send('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="#342047"/><text x="15" y="46" fill="#d6a7ff" font-size="44">D</text></svg>','image/svg+xml');
   return route.fulfill({status:404,body:''});
  });
  const noOverflow=()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
  await page.goto(root+'/admin/monetization/membership-page');
  await page.waitForFunction(()=>document.querySelector('#currentTier')?.textContent==='DROPSO LITE');
  assert(await noOverflow(),'membership page overflows at '+viewport.width);
  await page.screenshot({path:'preview-screenshots/membership-'+viewport.width+'.png',fullPage:true});
  await page.goto(root+'/admin/monetization/s2-design');
  await page.waitForSelector('[data-level="50"]',{state:'attached'});
  await page.locator('#sync').click();await page.waitForSelector('.level.current');
  assert.equal(await page.locator('#levels .reward').count(),100);
  assert(await noOverflow(),'S2 page overflows at '+viewport.width);
  assert(await page.locator('#scroller').evaluate(e=>e.scrollWidth>e.clientWidth));
  await page.screenshot({path:'preview-screenshots/s2-'+viewport.width+'.png',fullPage:true});
  assert.deepEqual(errors,[]);await page.close();
 }
}finally{await browser.close()}
