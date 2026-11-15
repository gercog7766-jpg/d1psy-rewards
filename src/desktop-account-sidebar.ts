import { brandLogoUrl } from './site-branding.js';

export const desktopAccountSidebar = String.raw`<style id="desktopAccountSidebarStyle">
.desktop-account-sidebar{display:none}
@media(min-width:900px){
  body[data-account-design="neon"] .account-art-rails{display:none}
  .desktop-account-layout{width:min(100%,1440px);margin-inline:auto;padding:20px clamp(14px,2vw,30px) 0;display:grid;grid-template-columns:clamp(190px,17vw,230px) minmax(0,1fr);gap:clamp(14px,2vw,26px);align-items:start}
  body[data-account-design="neon"] .desktop-account-layout>main{width:100%;min-width:0;max-width:none;margin:0;border:1px solid #6d3b914d;border-radius:18px;padding:22px clamp(16px,2vw,30px) 36px}
  .desktop-account-layout #accountLogoMenuToggle,.desktop-account-layout .top .economybar:empty{display:none}
  .desktop-account-sidebar{display:flex;flex-direction:column;position:sticky;top:20px;max-height:calc(100dvh - 40px);overflow:auto;scrollbar-width:thin;padding:10px;gap:6px;border:1px solid #7945a360;border-radius:16px;background:linear-gradient(155deg,#251535,#120c1c 70%);box-shadow:0 16px 40px #0004}
  .desktop-account-sidebar .desktop-account-brand{display:flex;align-items:center;gap:9px;padding:2px 9px 8px;color:#f8efff;font:800 16px/1.2 system-ui;letter-spacing:.08em;text-decoration:none}
  .desktop-account-brand img{width:34px;height:34px}
  .desktop-account-sidebar .desktop-account-group{display:grid;gap:2px}
  .desktop-account-sidebar .desktop-account-group+.desktop-account-group{padding-top:6px;border-top:1px solid #8651a94f}
  .desktop-account-sidebar .desktop-account-group>a,.desktop-account-sidebar .desktop-account-group>button{display:flex;align-items:center;justify-content:flex-start;gap:7px;width:100%;min-height:36px;padding:7px 9px;margin:0;border:1px solid transparent;border-radius:8px;background:transparent;color:#f0e4fc;text-decoration:none;text-align:left;font:650 13px/1.35 system-ui;cursor:pointer}
  .desktop-account-sidebar .desktop-account-group>a:hover,.desktop-account-sidebar .desktop-account-group>button:hover{background:#7135a63d;border-color:#9454c175;color:white}
  .desktop-account-sidebar :focus-visible{outline:2px solid #dba5ff;outline-offset:-2px}
  .desktop-account-sidebar .desktop-account-group>.logo-menu-balance{display:flex;justify-content:space-between;flex-wrap:wrap;color:#ffda82;background:#c3952414;border-color:#ad834649}
  .desktop-account-sidebar #messagesUnreadDot{position:static;display:inline-block;margin-left:6px;vertical-align:middle}
}
</style><script id="desktopAccountSidebarScript">(()=>{
function boot(){
  const main=document.querySelector('body[data-account-design="neon"] main');
  const bar=main?.querySelector('.top .economybar');
  const panel=document.getElementById('accountLogoMenuPanel');
  if(!main||!bar||!panel||document.getElementById('desktopAccountSidebar'))return;

  const layout=document.createElement('div');
  layout.className='desktop-account-layout';
  const sidebar=document.createElement('nav');
  sidebar.id='desktopAccountSidebar';
  sidebar.className='desktop-account-sidebar';
  sidebar.setAttribute('aria-label','Меню Dropso');
  sidebar.innerHTML='<a class="desktop-account-brand" href="/account" aria-current="page"><img src="${brandLogoUrl}" alt="" width="34" height="34">Dropso</a>';
  layout.append(sidebar);

  const sections=[
    ['.logo-menu-balance','#promoOpen','#accountStatisticsLink','a[href="/profile/customize"]','a[href="/referrals"]','#d1PwaOpen'],
    ['a[href="/users"]','#messagesTopLink','a[href="/community"]','#notificationsLink'],
    ['a[href="/shop"],a[href="#shop"]','a[href="/upgrader"],a[href="/upgrade"]','#skinBattlesLink','#threeDoorsLink','#pickLink','#gamesLink','#piggyBankLink','#predictLink','#streamersLink','#suggestionsLink']
  ];
  const media=matchMedia('(min-width:900px)');
  const moved=[];
  function sync(){
    if(!media.matches){
      for(const {node,placeholder,role,tabIndex} of moved.splice(0)){
        if(!sidebar.contains(node)){
          placeholder.remove();
          continue;
        }
        placeholder.replaceWith(node);
        if(role!==null)node.setAttribute('role',role);
        if(tabIndex===null)node.removeAttribute('tabindex');
        else node.setAttribute('tabindex',tabIndex);
      }
      for(const group of sidebar.querySelectorAll('.desktop-account-group'))group.remove();
      if(layout.isConnected)layout.replaceWith(main);
      return;
    }
    if(layout.isConnected)return;

    const controls=[...panel.children,...bar.children];
    function move(node,group){
      const placeholder=document.createComment('desktop account navigation');
      node.before(placeholder);
      moved.push({node,placeholder,role:node.getAttribute('role'),tabIndex:node.getAttribute('tabindex')});
      node.removeAttribute('role');
      node.removeAttribute('tabindex');
      group.append(node);
    }
    let group;
    for(const selectors of sections){
      group=document.createElement('div');
      group.className='desktop-account-group';
      sidebar.append(group);
      for(const selector of selectors){
        const node=controls.find(item=>item.matches(selector)&&!sidebar.contains(item));
        if(node)move(node,group);
      }
    }
    for(const node of controls){
      if(node.matches('a,button')&&!sidebar.contains(node))move(node,group);
    }
    main.before(layout);
    layout.append(main);
  }
  document.addEventListener('beforeMobileAccountNavigation',sync);
  media.addEventListener('change',()=>{
    if(media.matches)requestAnimationFrame(sync);
    else sync();
  });
  sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})();</script>`;
