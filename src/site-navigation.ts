import {brandLogoUrl} from './site-branding.js';
import {accountFooterHtml,accountFooterStyles} from './account-footer-hotfix.js';

const destinations = [
  ['/account','Главная'], ['/shop','Магазин'], ['/upgrader','Апгрейдер'],
  ['/games','Игры'], ['/games/battles','Сражения'], ['/games/three-doors','Три двери'],
  ['/games/pick','Pick'], ['/black-box','Чёрный ящик'], ['/games/red-button','Красная кнопка'],
  ['/predict','Предикты'], ['/predict/major-pickem','Major Pick’em'],
  ['/vault','THE VAULT'], ['/season','NIGHT SHIFT'],
  ['/users','Пользователи'], ['/community','Сообщения'], ['/streamers','Стримеры'],
  ['/statistics','Статистика'], ['/savings','Накопления'], ['/referrals','Рефералы'],
  ['/suggestions','Предложения'],
] as const;

const styles = `<style id="dropsoSiteNavigationStyle">
body[data-dropso-shell]{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
body[data-dropso-shell] .dropso-home,body[data-dropso-shell] .dropso-site-header a,body[data-dropso-shell] .dropso-site-sidebar a,body[data-dropso-shell] .dropso-site-sidebar summary{box-sizing:border-box;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;text-decoration:none;letter-spacing:0;text-transform:none}
body[data-dropso-shell]>.dropso-site-header{box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:16px;width:min(1440px,100%);min-height:72px;margin:0 auto;padding:12px clamp(14px,3vw,30px);position:relative;z-index:20}
body[data-dropso-shell] .dropso-home{display:inline-flex;align-items:center;flex:none;gap:9px;min-height:44px;color:#f6edff!important;background:transparent!important;border:0!important;padding:0!important;font-size:20px!important;font-weight:800!important;line-height:1.2!important;white-space:nowrap}
body[data-dropso-shell] .dropso-home img{display:block;width:32px!important;height:32px!important;object-fit:contain;flex:none;filter:drop-shadow(0 0 8px #9e2df533)}
body[data-dropso-shell] .dropso-site-shortcuts{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
body[data-dropso-shell] .dropso-site-shortcuts a{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:8px 13px;border:1px solid #70428f;border-radius:10px;background:#241431;color:#f2e6fc;font-size:13px;font-weight:650;line-height:1.3}
body[data-dropso-shell] .dropso-site-header a:focus-visible,body[data-dropso-shell] .dropso-site-sidebar :focus-visible{outline:2px solid #d7a4ff;outline-offset:3px}
body[data-dropso-shell] .dropso-site-sidebar{box-sizing:border-box;margin:0 14px 12px;padding:8px;border:1px solid #70428f70;border-radius:14px;background:linear-gradient(150deg,#251535,#120c1c);color:#f2e6fc}
body[data-dropso-shell] .dropso-site-sidebar details{display:block}
body[data-dropso-shell] .dropso-site-sidebar summary{min-height:44px;padding:11px 12px;cursor:pointer;font-size:14px;font-weight:700}
body[data-dropso-shell] .dropso-site-sidebar nav{display:grid;gap:3px;flex-wrap:initial}
body[data-dropso-shell] .dropso-site-sidebar details:not([open])+nav{display:none}
body[data-dropso-shell] .dropso-site-sidebar nav a{display:flex;align-items:center;min-height:40px;padding:9px 12px;border:1px solid transparent;border-radius:8px;color:#e5d5f1;background:transparent;font-size:13px;font-weight:600;line-height:1.35}
body[data-dropso-shell] .dropso-site-sidebar nav a:hover,body[data-dropso-shell] .dropso-site-sidebar nav a[aria-current]{background:#7539a535;border-color:#9254bd70;color:white}
body[data-dropso-shell] a.brand,body[data-dropso-shell] div.brand{display:none!important}
body[data-dropso-shell] #accountLogoMenuToggle{font-size:14px;letter-spacing:0}
body[data-dropso-shell] .desktop-account-sidebar .desktop-account-brand{display:none}
body[data-dropso-shell] .desktop-account-sidebar .desktop-account-group>a,body[data-dropso-shell] .desktop-account-sidebar .desktop-account-group>button{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
body[data-dropso-shell] #d1psyFooter{box-sizing:border-box;width:min(1380px,calc(100% - 28px));max-width:1380px;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
body[data-dropso-shell] #d1psyFooter .footer-brand{font-size:15px}
@media(min-width:1100px){
 body[data-dropso-shell] .dropso-site-layout{display:grid;grid-template-columns:210px minmax(0,1fr);gap:24px;align-items:start;width:min(1440px,100%);box-sizing:border-box;margin:0 auto;padding:0 24px}
 body[data-dropso-shell] .dropso-site-layout>.dropso-site-sidebar{position:sticky;top:16px;max-height:calc(100dvh - 32px);overflow-y:auto;margin:0}
 body[data-dropso-shell] .dropso-site-sidebar details{display:none}
 body[data-dropso-shell] .dropso-site-sidebar details:not([open])+nav{display:grid}
 body[data-dropso-shell] .dropso-site-layout>main{box-sizing:border-box;width:100%;min-width:0;max-width:100%;margin:0;padding-inline:clamp(0px,1vw,14px)}
}
@media(max-width:1099px){body[data-dropso-shell] .dropso-site-sidebar nav{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:420px){body[data-dropso-shell]>.dropso-site-header{gap:10px}body[data-dropso-shell] .dropso-site-shortcuts a{padding:8px 10px}body[data-dropso-shell] .dropso-home{font-size:20px!important}}
</style>`;

const boot = `<script id="dropsoSiteNavigationScript">(()=>{
 function start(){
  const sidebar=document.getElementById('dropsoSiteSidebar');
  const main=document.querySelector('body>main');
  if(sidebar&&main){
   const layout=document.createElement('div');layout.className='dropso-site-layout';
   sidebar.before(layout);layout.append(sidebar,main);
  }
  const toggle=document.getElementById('accountLogoMenuToggle');
  if(toggle){const label=document.createElement('span');label.textContent='Меню';toggle.replaceChildren(label)}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();</script>`;

/** Shared document navigation runs after page-specific HTML decorations. */
export function withSiteNavigation(html:string,path:string){
 path=path.replace(/\/+$/,'')||'/';
 if(!/^\s*(?:<!doctype html|<html\b)/i.test(html)||!/<body\b/i.test(html)||!/<\/body>/i.test(html)
   ||/^\/(?:obs|streamer\/obs|auth|api|desktop)(?:\/|$)/.test(path)
   ||html.includes('id="dropsoSiteNavigationStyle"'))return html;
 const wide=path==='/shop'||path==='/upgrader';
 const sidebar=!wide&&path!=='/account'&&path!=='/'&&!/^\/(?:admin|privacy|rules|terms)(?:\/|$)/.test(path);
 const current=destinations.filter(([href])=>path===href||path.startsWith(href+'/')).sort((a,b)=>b[0].length-a[0].length)[0]?.[0];
 const links=destinations.map(([href,label])=>`<a href="${href}"${href===current?' aria-current="page"':''}>${label}</a>`).join('');
 const menu=sidebar?`<aside id="dropsoSiteSidebar" class="dropso-site-sidebar"><details><summary>Меню Dropso</summary></details><nav aria-label="Меню Dropso">${links}</nav></aside>`:'';
 const brand=`<a class="dropso-home" href="/account" aria-label="Dropso — на главную"><img src="${brandLogoUrl}" alt="" width="32" height="32"><span>Dropso</span></a>`;
 const shortcut=path==='/shop'?'<a href="/upgrader">Апгрейдер</a>':path==='/upgrader'?'<a href="/shop">Магазин</a>':'';
 const header=`<header class="dropso-site-header">${brand}<nav class="dropso-site-shortcuts" aria-label="Переходы">${shortcut}</nav></header>${menu}`;
 // Process static markup without touching script templates, selectors or strings.
 html=html.split(/(<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>)/gi).map((part,index)=>index%2?part:part
   .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi,'')
   .replace(/<a\b[^>]*href=["'](?:\/account|\/)["'][^>]*>\s*(?:←\s*)?(?:На главную|На главный экран|Главная|Домой)\s*<\/a>/gi,'')
 ).join('');
 const footer=accountFooterHtml.replace(/D1PSY Rewards/g,'Dropso').replace('<strong>Dropso</strong>',`<img src="${brandLogoUrl}" alt="" width="30" height="30"><strong>Dropso</strong>`);
 html=html.replace(/<body\b([^>]*)>/i,(_match,attrs)=>`<body${attrs} data-dropso-shell>${header}`);
 if(!html.includes('id="d1psyFooterStyles"'))html=html.replace(/<\/head>/i,accountFooterStyles+'</head>');
 return html.replace(/<\/head>/i,styles+'</head>').replace(/<\/body>/i,()=>footer+boot+'</body>');
}
