export const pwaManifest={id:'/',name:'D1PSY Rewards',short_name:'D1PSY',description:'Твой инвентарь, игры и дропы D1PSY Rewards',lang:'ru',start_url:'/app',scope:'/',display:'standalone',background_color:'#100b18',theme_color:'#21112f',icons:[{src:'/pwa/icon/192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/pwa/icon/512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'/pwa/icon/maskable.png',sizes:'512x512',type:'image/png',purpose:'maskable'}],shortcuts:[{name:'Мой инвентарь',url:'/app'},{name:'Игры',url:'/games'},{name:'Магазин',url:'/shop'}]};
export const offlineHtml=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#21112f"><title>D1PSY · Нет подключения</title><style>body{margin:0;background:#100b18;color:#f4eaff;font:16px/1.6 system-ui,sans-serif;min-height:100vh;display:grid;place-items:center}main{max-width:420px;padding:30px}b{color:#bf8aff;font-size:14px;letter-spacing:2px}h1{font-size:30px}p{color:#b9a7cc}a{display:inline-block;background:#843ce3;color:white;padding:12px 20px;border-radius:12px;text-decoration:none}</style><main><b>D1PSY REWARDS</b><h1>Сейчас нет подключения</h1><p>Подключись к интернету, чтобы открыть инвентарь, игры и актуальный баланс. Твои данные сохранены в аккаунте.</p><a href="/app">Попробовать снова</a></main></html>`;
export const pwaSw=String.raw`
const CACHE='d1psy-pwa-static-v1';
const PUBLIC_ASSETS=['/pwa/offline','/pwa/icon/192.png','/pwa/icon/512.png','/pwa/icon/maskable.png','/pwa/icon/apple.png','/pwa/icon/badge.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(PUBLIC_ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('d1psy-pwa-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(url.origin!==self.location.origin||event.request.method!=='GET')return;
 if(url.pathname.startsWith('/auth/')||url.pathname==='/logout')return;
 if(PUBLIC_ASSETS.includes(url.pathname)){event.respondWith(caches.match(url.pathname).then(c=>c||fetch(event.request)));return}
 // Account HTML, auth redirects, APIs and game actions are never cached.
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('/pwa/offline')));
});
self.addEventListener('push',event=>{
 let p={};try{p=event.data?.json()||{}}catch{}
 event.waitUntil(self.registration.showNotification(String(p.title||'D1PSY Rewards'),{body:String(p.body||'Открой приложение, чтобы посмотреть обновление.').slice(0,240),icon:'/pwa/icon/192.png',badge:'/pwa/icon/badge.png',tag:String(p.tag||'d1psy-drop').slice(0,100),data:{url:'/app'},renotify:false}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){if(new URL(client.url).origin===self.location.origin){await client.navigate('/app');return client.focus()}}
  return self.clients.openWindow('/app');
 })());
});`;
export const pwaHead=`<link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#21112f"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="D1PSY"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><link rel="apple-touch-icon" href="/pwa/icon/apple.png"><script src="/pwa.js" defer></script>`;
export const pwaPanel=String.raw`<section id="d1PwaPanel" style="padding:16px 18px;margin:16px 0;border:1px solid #674080;border-radius:14px;background:linear-gradient(130deg,#291638,#171020);font:14px/1.5 Arial,sans-serif;color:#f4eaff"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><strong style="font-size:16px">D1PSY в твоём телефоне</strong><div style="font-size:12px;color:#c8b0da;margin-top:4px">Быстрый запуск с главного экрана и уведомления о твоих дропах.</div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" id="d1Install" style="border:1px solid #ad6aff;border-radius:9px;padding:10px 13px;background:#7833bd;color:white;font:700 13px Arial;cursor:pointer">Установить приложение</button><button type="button" id="d1Push" disabled style="border:1px solid #77508e;border-radius:9px;padding:10px 13px;background:#2b193b;color:#f5eaff;font:700 13px Arial;cursor:pointer">Загрузка уведомлений…</button><button type="button" id="d1PushTest" hidden style="border:1px solid #77508e;border-radius:9px;padding:10px 13px;background:#2b193b;color:#f5eaff;font:700 13px Arial;cursor:pointer">Проверить push</button></div></div><p id="d1PwaStatus" role="status" style="margin:9px 0 0;font-size:12px;color:#c6aed8"></p><div id="d1InstallHelp" hidden style="margin-top:12px;padding-top:12px;border-top:1px solid #624076;color:#decbed;font-size:13px"></div></section>`;
export const pwaJs=String.raw`(()=>{
if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
let installEvent=null,registration=null,config=null,subscription=null,busy=false;
const $=id=>document.getElementById(id),status=s=>{if($('d1PwaStatus'))$('d1PwaStatus').textContent=s};
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;syncInstall()});
window.addEventListener('appinstalled',()=>{installEvent=null;syncInstall();status('Приложение установлено. Открывай D1PSY с главного экрана.')});
function syncInstall(){const b=$('d1Install');if(b){b.hidden=standalone();b.textContent=installEvent?'Установить приложение':'Как установить'}}
async function request(path,body,method='POST'){const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'same-origin'});if(!r.ok){if(r.status===401)throw Error('Войди в аккаунт, чтобы включить уведомления.');throw Error('Не удалось сохранить настройки. Попробуй ещё раз.')}return r.json()}
function keyBytes(key){const a=atob(key.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(a,c=>c.charCodeAt(0))}
function syncPush(){const b=$('d1Push');if(!b)return;
 if(!config?.ready){b.disabled=true;b.textContent='Уведомления временно недоступны';return}
 if(ios()&&!standalone()){b.disabled=true;b.textContent='Push после установки';status('На iPhone сначала добавь приложение на экран «Домой» и открой его оттуда.');return}
 if(!('PushManager' in window)||!('Notification' in window)){b.disabled=true;b.textContent='Push не поддерживается';return}
 if(Notification.permission==='denied'){b.disabled=true;b.textContent='Уведомления запрещены';status('Разреши уведомления для D1PSY в настройках браузера или телефона.');return}
 b.disabled=busy;b.textContent=subscription?'Отключить уведомления':'Включить уведомления';if($('d1PushTest'))$('d1PushTest').hidden=!subscription;
}
async function init(){try{
 registration=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});await navigator.serviceWorker.ready;
 const r=await fetch('/api/me/push',{cache:'no-store'});if(!r.ok){if($('d1Push')){$('d1Push').textContent='Войди для уведомлений';$('d1Push').disabled=true}return}
 config=await r.json();subscription=await registration.pushManager?.getSubscription();
 // Reconcile a browser permission revoked or a subscription removed after logout.
 if(subscription&&!config.endpoints?.includes(subscription.endpoint)){await subscription.unsubscribe();subscription=null}
 syncPush();syncInstall();
 }catch{status('Не удалось подключить приложение. Проверь интернет и обнови страницу.')}}
if($('d1Install'))$('d1Install').onclick=async()=>{
 if(installEvent){const event=installEvent;installEvent=null;await event.prompt();await event.userChoice;syncInstall();return}
 const help=$('d1InstallHelp');help.hidden=!help.hidden;help.textContent=ios()?'iPhone / iPad: открой сайт в Safari → «Поделиться» → «На экран Домой» → «Добавить». Затем запусти D1PSY с новой иконки. Если приложение попросит войти впервые, войди в нём один раз.':'Android: открой меню браузера ⋮ → «Установить приложение» или «Добавить на главный экран». Если такого пункта нет, попробуй Chrome. На компьютере используй значок установки в адресной строке.';
};
if($('d1Push'))$('d1Push').onclick=async()=>{
 if(busy||!registration||!config?.ready)return;busy=true;syncPush();
 try{
  if(subscription){const old=subscription;await request('/api/me/push',{endpoint:old.endpoint},'DELETE');await old.unsubscribe();subscription=null;status('Уведомления на этом устройстве отключены.')}
  else{
   // Permission is requested directly in the user's click gesture (required on iOS).
   const permission=await Notification.requestPermission();if(permission!=='granted'){status('Разрешение не получено. Уведомления можно включить позже.');return}
   const created=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(config.publicKey)});
   try{await request('/api/me/push',created.toJSON());subscription=created;status('Готово! Когда тебе выпадет дроп, придёт уведомление — даже если приложение закрыто.')}
   catch(e){await created.unsubscribe();throw e}
  }
 }catch(e){status(e.message||'Не удалось включить уведомления.')}
 finally{busy=false;syncPush()}
};
if($('d1PushTest'))$('d1PushTest').onclick=async()=>{const b=$('d1PushTest');b.disabled=true;try{await request('/api/me/push/test',{});status('Проверочное уведомление отправлено в очередь.')}catch(e){status(e.message)}finally{b.disabled=false}};
syncInstall();init();
})();`;
