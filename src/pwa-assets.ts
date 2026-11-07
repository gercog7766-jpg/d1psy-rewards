export const pwaManifest={id:'/',name:'D1PSY Rewards',short_name:'D1PSY',description:'Твой инвентарь, игры и дропы D1PSY Rewards',lang:'ru',start_url:'/app',scope:'/',display:'standalone',background_color:'#100b18',theme_color:'#21112f',icons:[{src:'/pwa/icon/brand-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/pwa/icon/brand-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'/pwa/icon/brand-maskable.png',sizes:'512x512',type:'image/png',purpose:'maskable'}],shortcuts:[{name:'Мой инвентарь',url:'/app'},{name:'Игры',url:'/games'},{name:'Магазин',url:'/shop'}]};
export const offlineHtml=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#21112f"><title>D1PSY · Нет подключения</title><style>body{margin:0;background:#100b18;color:#f4eaff;font:16px/1.6 system-ui,sans-serif;min-height:100vh;display:grid;place-items:center}main{max-width:420px;padding:30px}b{color:#bf8aff;font-size:14px;letter-spacing:2px}h1{font-size:30px}p{color:#b9a7cc}a{display:inline-block;background:#843ce3;color:white;padding:12px 20px;border-radius:12px;text-decoration:none}</style><main><b>D1PSY REWARDS</b><h1>Сейчас нет подключения</h1><p>Подключись к интернету, чтобы открыть инвентарь, игры и актуальный баланс. Твои данные сохранены в аккаунте.</p><a href="/app">Попробовать снова</a></main></html>`;
export const pwaSw=String.raw`
const CACHE='d1psy-pwa-static-brand-v2';
const PUBLIC_ASSETS=['/pwa/offline','/pwa/icon/brand-logo.png','/pwa/icon/brand-favicon.png','/pwa/icon/brand-192.png','/pwa/icon/brand-512.png','/pwa/icon/brand-maskable.png','/pwa/icon/brand-apple.png','/pwa/icon/brand-badge.png'];
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
 event.waitUntil(self.registration.showNotification(String(p.title||'D1PSY Rewards'),{body:String(p.body||'Открой приложение, чтобы посмотреть обновление.').slice(0,240),icon:'/pwa/icon/brand-192.png',badge:'/pwa/icon/brand-badge.png',tag:String(p.tag||'d1psy-drop').slice(0,100),data:{url:'/app'},renotify:false}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){if(new URL(client.url).origin===self.location.origin){await client.navigate('/app');return client.focus()}}
  return self.clients.openWindow('/app');
 })());
});`;
export const pwaHead=`<link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#21112f"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="D1PSY"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><link rel="apple-touch-icon" href="/pwa/icon/brand-apple.png"><script src="/pwa.js" defer></script>`;
export const pwaPanel=String.raw`<style id="d1PwaDialogStyle">
#d1PwaPanel{width:min(720px,calc(100% - 24px));max-height:88vh;max-height:88dvh;overflow:auto;overscroll-behavior:contain;margin:auto;padding:0;border:1px solid #795096;border-radius:20px;background:linear-gradient(140deg,#281635,#130e1c);color:#f6eeff;font:14px/1.6 Arial,Helvetica,sans-serif;box-shadow:0 28px 100px #0009}
#d1PwaPanel::backdrop{background:#07040cc9;backdrop-filter:blur(6px)}
#d1PwaPanel .pwa-inner{padding:26px}#d1PwaPanel .pwa-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}#d1PwaPanel h2{margin:0;font-size:25px;line-height:1.2}#d1PwaPanel .pwa-subtitle{margin:8px 0 20px;color:#c3acd3;font-size:13px}
#d1PwaPanel .pwa-close{flex:none;width:36px;height:36px;border:1px solid #77508e;border-radius:10px;background:#352041;color:#fff;font:24px Arial;cursor:pointer}
#d1PwaPanel .pwa-platforms{display:grid;grid-template-columns:1fr 1fr;gap:12px}#d1PwaPanel .pwa-guide{padding:17px;border:1px solid #634078;border-radius:13px;background:#140e1e77}#d1PwaPanel h3{margin:0 0 9px;font-size:17px;color:#e5c7ff}#d1PwaPanel ol{padding-left:20px;margin:0}#d1PwaPanel li{padding-left:3px;margin:0 0 9px;color:#d5c3e1}#d1PwaPanel li:last-child{margin-bottom:0}#d1PwaPanel b{color:#fff}
#d1PwaPanel .pwa-note{margin:13px 0 0;color:#bda7ce;font-size:12px}#d1PwaPanel .pwa-push{margin-top:20px;padding-top:20px;border-top:1px solid #654079}#d1PwaPanel .pwa-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:15px}
#d1PwaPanel .pwa-action{border:1px solid #9860bd;border-radius:10px;padding:10px 14px;background:#30203e;color:#f7eeff;font:700 13px Arial;cursor:pointer}#d1PwaPanel .pwa-primary{background:#7d36c7;border-color:#b97ff2}#d1PwaPanel button:disabled{opacity:.5;cursor:not-allowed}#d1PwaPanel button[hidden]{display:none}#d1PwaPanel button:focus-visible{outline:2px solid #edceff;outline-offset:3px}
#d1PwaStatus{color:#d3b6e5;font-size:13px;margin:12px 0 0;min-height:20px}
@media(max-width:560px){#d1PwaPanel .pwa-inner{padding:20px 16px}#d1PwaPanel .pwa-platforms{grid-template-columns:1fr}#d1PwaPanel h2{font-size:22px}#d1PwaPanel .pwa-action{flex:1}}
</style><dialog id="d1PwaPanel" aria-labelledby="d1PwaTitle" aria-describedby="d1PwaSubtitle"><div class="pwa-inner"><div class="pwa-header"><div><h2 id="d1PwaTitle">Приложение D1PSY</h2><p class="pwa-subtitle" id="d1PwaSubtitle">Установи сайт на главный экран и включи уведомления о своих дропах.</p></div><button type="button" class="pwa-close" id="d1PwaClose" aria-label="Закрыть окно приложения">×</button></div>
<div id="d1InstallHelp" class="pwa-platforms"><section class="pwa-guide"><h3>Android</h3><ol><li>Открой сайт D1PSY в <b>Google Chrome</b> и войди в аккаунт.</li><li>Нажми <b>«Установить приложение»</b> ниже. Если кнопки установки нет: меню Chrome <b>⋮ → «Установить приложение»</b> или <b>«Добавить на главный экран»</b>.</li><li>Подтверди установку и запусти D1PSY с новой иконки.</li></ol></section><section class="pwa-guide"><h3>iPhone / iPad</h3><ol><li>Открой сайт D1PSY в <b>Safari</b> и войди в аккаунт.</li><li>Нажми <b>«Поделиться» → «На экран Домой» → «Добавить»</b>.</li><li>Закрой Safari и запусти D1PSY с новой иконки на главном экране.</li></ol><p class="pwa-note">Для push нужен iOS / iPadOS 16.4 или новее и запуск именно с иконки приложения.</p></section></div>
<p class="pwa-note">На компьютере: меню Chrome / Edge → «Установить D1PSY Rewards» или значок установки в адресной строке.</p><p class="pwa-note">Вход сохраняется между запусками. Если установленное приложение попросит войти впервые — войди в нём один раз.</p><div class="pwa-actions"><button type="button" id="d1Install" class="pwa-action pwa-primary" hidden>Установить приложение</button></div>
<section class="pwa-push"><h3>Уведомления о дропах</h3><ol><li>В установленном приложении открой <b>«Приложение»</b> и нажми <b>«Включить уведомления»</b>.</li><li>В запросе телефона выбери <b>«Разрешить»</b>.</li><li>Нажми <b>«Проверить push»</b> — должно прийти тестовое уведомление.</li></ol><p class="pwa-note">Когда тебе выпадет предмет в стримовом розыгрыше, придёт уведомление. Если push не приходит, проверь разрешение уведомлений для D1PSY и ограничения работы браузера в фоне в настройках телефона.</p><div class="pwa-actions"><button type="button" id="d1Push" class="pwa-action pwa-primary" disabled>Загрузка уведомлений…</button><button type="button" id="d1PushTest" class="pwa-action" hidden>Проверить push</button></div><p id="d1PwaStatus" role="status" aria-live="polite"></p></section></div></dialog>`;
export const pwaJs=String.raw`(()=>{
let installEvent=null,registration=null,config=null,subscription=null,busy=false;
const $=id=>document.getElementById(id),status=s=>{if($('d1PwaStatus'))$('d1PwaStatus').textContent=s};
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;syncInstall()});
window.addEventListener('appinstalled',()=>{installEvent=null;syncInstall();status('Приложение установлено. Открывай D1PSY с главного экрана.')});
function syncInstall(){const b=$('d1Install');if(b){b.hidden=standalone()||!installEvent;b.textContent='Установить приложение'}}
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
 $('d1InstallHelp')?.scrollIntoView({block:'nearest',behavior:'smooth'});
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
const dialog=$('d1PwaPanel'),open=$('d1PwaOpen');
function closeApp(){if(dialog?.open){dialog.close();open?.focus()}}
if(open&&dialog)open.onclick=()=>{if(!dialog.open)dialog.showModal()};
if($('d1PwaClose'))$('d1PwaClose').onclick=closeApp;
if(dialog){dialog.addEventListener('cancel',e=>{e.preventDefault();closeApp()});dialog.addEventListener('click',e=>{if(e.target===dialog){const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)closeApp()}})}
syncInstall();
if(!('serviceWorker' in navigator)||!window.isSecureContext){if($('d1Push')){$('d1Push').textContent='Push не поддерживается';$('d1Push').disabled=true}status('Открой сайт в современном браузере по HTTPS. Инструкции по установке приведены выше.')}else init();
})();`;
