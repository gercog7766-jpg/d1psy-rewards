import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {pwaPanel,pwaJs} from '../src/pwa-assets.ts';
const tick=()=>new Promise(r=>setTimeout(r,10));
test('PWA UI: opt-in permission, subscribe, test, unsubscribe and install instructions',async()=>{
 const dom=new JSDOM('<button id="d1PwaOpen">Приложение</button>'+pwaPanel,{url:'https://d1psy.test/account',runScripts:'outside-only'}),w=dom.window;let permissionCalls=0,subscribed=0,unsubscribed=0,requests=[];
 const sub={endpoint:'https://fcm.googleapis.com/test',toJSON(){return {endpoint:this.endpoint,keys:{p256dh:'key',auth:'auth'}}},unsubscribe:async()=>{unsubscribed++}};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 Object.defineProperty(w,'isSecureContext',{value:true});w.matchMedia=()=>({matches:false});
 w.Notification={permission:'default',requestPermission:async()=>{permissionCalls++;w.Notification.permission='granted';return 'granted'}};w.PushManager=function(){};
 Object.defineProperty(w.navigator,'serviceWorker',{value:{register:async()=>({pushManager:{getSubscription:async()=>null,subscribe:async opts=>{assert(opts.userVisibleOnly);subscribed++;return sub}}}),ready:Promise.resolve()}});
 w.fetch=async(path,opts)=>{requests.push([path,opts]);return {ok:true,json:async()=>path==='/api/me/push'&&!opts?.method?{ready:true,publicKey:'BA',endpoints:[]}:{ok:true}}};
 w.eval(pwaJs);await tick();assert.equal(permissionCalls,0);const q=id=>w.document.getElementById(id);
 assert.equal(q('d1PwaPanel').open,false);q('d1PwaOpen').click();assert(q('d1PwaPanel').open);assert(q('d1InstallHelp').textContent.includes('Android'));assert(q('d1InstallHelp').textContent.includes('iPhone'));
 q('d1PwaClose').click();assert.equal(q('d1PwaPanel').open,false);assert.equal(w.document.activeElement,q('d1PwaOpen'));q('d1PwaOpen').click();q('d1PwaPanel').dispatchEvent(new w.Event('cancel',{cancelable:true}));assert.equal(q('d1PwaPanel').open,false);q('d1PwaOpen').click();
 let prompts=0;const event=new w.Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>prompts++;event.userChoice=Promise.resolve({outcome:'accepted'});w.dispatchEvent(event);assert.equal(q('d1Install').hidden,false);q('d1Install').click();await tick();assert.equal(prompts,1);
 q('d1Push').click();await tick();assert.equal(permissionCalls,1);assert.equal(subscribed,1);assert(q('d1Push').textContent.includes('Отключить'));assert.equal(q('d1PushTest').hidden,false);
 q('d1PushTest').click();await tick();assert(requests.some(([p])=>p.endsWith('/test')));
 q('d1Push').click();await tick();assert.equal(unsubscribed,1);assert(requests.some(([,o])=>o?.method==='DELETE'));assert(q('d1Push').textContent.includes('Включить'));dom.window.close();
});
