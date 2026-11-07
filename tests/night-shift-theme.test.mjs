import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {nightShiftHtml,nightShiftPage,nightShiftCss} from '../src/night-shift-theme.ts';
import {gamesHtml,wordlyHtml} from '../src/games-ui.ts';import {predictHtml} from '../src/predict-ui.ts';import {contractsHtml} from '../src/contracts-ui.ts';import {usersHtml,profileHtml} from '../src/users-ui.ts';import {liveHtml} from '../src/live-ui.ts';
test('shared theme preserves all live controls, links, scripts and semantic match states',()=>{
 for(const [path,html] of [['/games',gamesHtml],['/games/wordly',wordlyHtml],['/predict',predictHtml],['/contracts',contractsHtml],['/users',usersHtml],['/users/viewer',profileHtml],['/live',liveHtml()]]){
  const before=new JSDOM(html),out=nightShiftHtml(html,path),after=new JSDOM(out);const a=before.window.document,b=after.window.document;
  assert.equal(b.body.dataset.nightShift,nightShiftPage(path));assert.equal(b.querySelectorAll('#nightShiftTheme').length,1);assert.equal(nightShiftHtml(out,path),out);
  const controls=d=>[...d.querySelectorAll('a,button,input,select,textarea,script')].map(x=>x.outerHTML);assert.deepEqual(controls(b),controls(a),path+' keeps actions and scripts unchanged');
  assert.deepEqual([...b.querySelectorAll('[id]')].filter(x=>x.id!=='nightShiftTheme').map(x=>x.id),[...a.querySelectorAll('[id]')].map(x=>x.id));
  before.window.close();after.window.close();
 }
 // Result colours are defined by existing state classes, not by the brand accent.
 for(const [path,html,cls] of [['/predict',predictHtml,'choice result-win selected'],['/predict',predictHtml,'choice result-loss selected'],['/live',liveHtml(),'outcome winner selected'],['/live',liveHtml(),'outcome loser selected'],['/games/wordly',wordlyHtml,'correct']]){
  const original=new JSDOM(html),themed=new JSDOM(nightShiftHtml(html,path));let color;
  for(const dom of [original,themed]){const el=dom.window.document.createElement('button');el.className=cls;dom.window.document.body.append(el);const value=dom.window.getComputedStyle(el).backgroundColor;if(color)assert.equal(value,color,path+' '+cls);color=value;dom.window.close()}
 }
 assert(nightShiftCss.includes('conic-gradient(from 0deg,#a02dff 0 var(--p,0%)'));assert(!nightShiftCss.includes('.cell{'));assert(!nightShiftCss.includes('.key{'));
});
test('theme covers requested routes and game children, excluding APIs, admin and OBS',()=>{
 const html='<!doctype html><html><head></head><body><button disabled>Action</button></body></html>';
 for(const path of ['/shop','/season','/games','/predict','/upgrader','/contracts','/users','/live','/games/tic-tac-toe','/games/minesweeper','/games/defuse','/community'])assert(nightShiftHtml(html,path).includes('id="nightShiftTheme"'),path);
 for(const path of ['/admin/live','/admin/predict','/api/me/live','/obs','/streamer/obs','/account','/predict.js','/users.js','/games/wordly.js'])assert.equal(nightShiftHtml(html,path),html,path);
 assert.equal(nightShiftHtml('{"data":"<html>"}','/shop'),'{"data":"<html>"}');
});
