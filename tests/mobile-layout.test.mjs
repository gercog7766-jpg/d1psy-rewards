import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import CSSOM from 'rrweb-cssom';
import {randomUUID} from 'node:crypto';
import {withMobileLayout,mobilePage,mobileLayoutCss} from '../src/mobile-layout.ts';
import {defuseHtml} from '../src/defuse-ui.ts';
import {minesweeperHtml,minesweeperJs} from '../src/minesweeper-ui.ts';
import {gamesHtml,wordlyHtml} from '../src/games-ui.ts';
import {tttHtml} from '../src/tic-tac-toe-ui.ts';
import {contractsHtml} from '../src/contracts-ui.ts';
import {predictHtml} from '../src/predict-ui.ts';

const controls=doc=>[...doc.querySelectorAll('a,button,input,select,textarea,form')].map(el=>el.outerHTML);
test('mobile presentation preserves every action and script; no desktop or OBS rules leak',()=>{
 for(const [path,html] of [['/games/defuse',defuseHtml],['/games/minesweeper',minesweeperHtml()],['/games',gamesHtml],['/games/wordly',wordlyHtml],['/games/tic-tac-toe',tttHtml],['/contracts',contractsHtml],['/predict',predictHtml]]){
  const output=withMobileLayout(html,path),before=new JSDOM(html),after=new JSDOM(output);
  assert.deepEqual(controls(after.window.document),controls(before.window.document),path);
  assert.deepEqual([...after.window.document.scripts].map(x=>x.outerHTML),[...before.window.document.scripts].map(x=>x.outerHTML),path);
  assert.equal(after.window.document.body.dataset.mobilePage,mobilePage(path));
  assert.equal(after.window.document.querySelectorAll('#mobileLayoutTheme').length,1);
  assert.equal(withMobileLayout(output,path),output);before.window.close();after.window.close();
 }
 const html='<!doctype html><html><head></head><body>OBS</body></html>';
 for(const path of ['/obs','/streamer/obs','/api/me','/games/defuse.js'])assert.equal(withMobileLayout(html,path),html);
 // Every new rule is under a breakpoint; the wide desktop presentation is untouched.
 const rules=CSSOM.parse(mobileLayoutCss).cssRules;assert(rules.length>0);
 assert(rules.every(rule=>rule.type===4&&/max-width:(760|480|840|1100)px/.test(rule.conditionText)));
 const implicit=withMobileLayout('<!doctype html><html><meta charset="utf-8"><main>Offline</main></html>','/pwa/offline');
 const dom=new JSDOM(implicit);assert.equal(dom.window.document.body.dataset.mobilePage,'public');dom.window.close();
});

test('Minesweeper adapts 10x10 and 25x25 at phone widths; scroll, flags and cell IDs survive redraws',async()=>{
 for(const width of [320,360,390,430]){
  for(const cols of [10,25]){
   const dom=new JSDOM(withMobileLayout(minesweeperHtml(),'/games/minesweeper'),{url:'https://test.local/games/minesweeper',runScripts:'outside-only'}),w=dom.window,calls=[];
   const q=id=>w.document.getElementById(id),region=q('msBoard').parentElement,available=width-52;
   Object.defineProperty(w,'innerWidth',{value:width});Object.defineProperty(region,'clientWidth',{value:available});w.crypto.randomUUID=randomUUID;
   const state={serverNow:new Date().toISOString(),attemptsLeft:2,cooldownUntil:null,levels:[{difficulty:'easy',mines:10,reward:5,width:cols,height:cols,timeLimitSeconds:180}],game:{id:randomUUID(),difficulty:'easy',attempt:1,status:'playing',version:0,mineCount:10,reward:5,width:cols,height:cols,timeLimitSeconds:180,deadlineAt:new Date(Date.now()+180000).toISOString(),cells:Array.from({length:cols*cols},(_,index)=>({index,open:false,flag:false,mine:false,value:null}))}};
   w.fetch=async(_path,options)=>{if(options?.method==='POST')calls.push(JSON.parse(options.body));return {ok:true,json:async()=>state}};
   try{
    w.eval(minesweeperJs);await new Promise(r=>setTimeout(r,20));const board=q('msBoard'),cell=parseInt(board.style.getPropertyValue('--cell'));
    assert.equal(board.children.length,cols*cols);
    if(cols===10){assert(cell*cols+(cols-1)*3<=available,width+' classic board fits');assert(q('msScrollHint').hidden)}
    else{assert(cell>=32);assert(!q('msScrollHint').hidden);region.scrollLeft=300;}
    q('msFlag').click();board.lastElementChild.click();await new Promise(r=>setTimeout(r,15));
    assert.equal(calls[0].cell,cols*cols-1);assert.equal(calls[0].action,'flag');
    if(cols===25)assert.equal(region.scrollLeft,300,'redraw keeps the scrolled position');
    assert.match(board.lastElementChild.getAttribute('aria-label'),new RegExp('Строка '+cols+', столбец '+cols));
   }finally{w.close()}
  }
 }
});
