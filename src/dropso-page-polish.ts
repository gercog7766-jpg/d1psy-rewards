// Final, route-scoped presentation layer. It deliberately leaves application
// markup, game boards, control IDs and the existing API contracts intact.
export function dropsoPageKind(path:string):string|null {
  const p=path.replace(/\/+$/,'')||'/';
  if(/^\/(?:api|auth|obs|desktop)(?:\/|$)/.test(p)||p==='/streamer/obs'||/\.[a-z0-9]+$/i.test(p))return null;
  if(p==='/account')return 'account';
  if(p==='/shop')return 'shop';
  if(p==='/upgrader')return 'upgrader';
  if(p==='/games')return 'games';
  if(p==='/games/red-button')return 'red-button';
  if(p.startsWith('/games/'))return 'game';
  if(p==='/predict/major-pickem')return 'major';
  if(p==='/predict')return 'predict';
  if(p.startsWith('/bosses'))return 'boss';
  if(p==='/black-box')return 'auction';
  if(p==='/vault')return 'vault';
  if(p==='/advent')return 'advent';
  if(p==='/season')return 'season';
  if(p==='/clans'||p.startsWith('/clans/'))return 'clans';
  if(p==='/streamers')return 'streamers';
  if(p==='/streamer'||p.startsWith('/streamer/'))return 'streamer';
  if(p==='/users'||p.startsWith('/users/'))return 'users';
  if(p==='/community'||p.startsWith('/community/')||p==='/messages')return 'messages';
  if(p==='/statistics')return 'statistics';
  if(p==='/level')return 'level';
  if(p==='/profile/customize')return 'profile';
  if(p==='/bonuses')return 'bonuses';
  if(p==='/savings')return 'savings';
  if(p==='/referrals')return 'referrals';
  if(p==='/notifications')return 'notifications';
  if(p==='/suggestions')return 'suggestions';
  if(p==='/admin'||p.startsWith('/admin/'))return 'admin';
  if(['/rules','/terms','/privacy'].includes(p))return 'legal';
  return 'general';
}

const css=String.raw`<style id="dropsoPagePolish">
/* Shared tokens and hierarchy. Specific gameplay artwork and states stay local. */
body[data-dropso-page]{--ds-surface:#171823;--ds-raised:#202033;--ds-line:#3b334e;--ds-text:#f5f1fb;--ds-muted:#bdb4cb;--ds-accent:#a26aef;--ds-primary:#7835c4;--ds-gold:#ffe08b;--ds-radius:14px;--ds-space:16px;color:var(--ds-text);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5}
body[data-dropso-page] .dropso-site-header{box-shadow:0 1px 0 #ffffff06;min-width:0}
body[data-dropso-page] .dropso-site-header .dropso-site-shortcuts{min-width:0;gap:8px}
body[data-dropso-page] .dropso-site-layout{max-width:1920px!important;box-sizing:border-box;min-width:0}
body[data-dropso-page] main{box-sizing:border-box;min-width:0}
body[data-dropso-page] main :where(h1,h2,h3,p,li,label,summary){overflow-wrap:break-word}
body[data-dropso-page] main>h1,body[data-dropso-page] main>.heading>h1,body[data-dropso-page] main>.intro>h1{font-size:clamp(27px,3vw,38px);line-height:1.13;letter-spacing:-.035em;font-weight:820;margin:10px 0 12px}
body[data-dropso-page] main :where(.muted,.hint,.footnote,.local-note){color:var(--ds-muted);line-height:1.5}
body[data-dropso-page] :where(button,input,select,textarea){font-family:inherit;max-width:100%;box-sizing:border-box}
body[data-dropso-page] :where(button,a,input,select,textarea,summary,[tabindex]):focus-visible{outline:2px solid #d2a2ff;outline-offset:3px}
body[data-dropso-page] button:disabled{cursor:not-allowed}
body[data-dropso-page] :where(input[type=checkbox],input[type=radio],input[type=range]){accent-color:var(--ds-accent)}
body[data-dropso-page] :where(dialog){max-width:min(94vw,720px);max-height:90dvh;overflow:auto;overscroll-behavior:contain}
body[data-dropso-page] :where(dialog)::backdrop{background:#080611c9}
body[data-dropso-page] :where(.table-wrap,.table-scroll,.live-center-table,.bracket-scroll){max-width:100%;min-width:0;overflow-x:auto;overscroll-behavior-inline:contain}
body[data-dropso-page] .dropso-site-sidebar nav a{min-height:40px;line-height:1.3}
body[data-dropso-page] .dropso-site-sidebar nav a:hover{background:#302340}
body[data-dropso-page] .dropso-site-sidebar .dropso-nav-group{gap:3px}
/* Content pages with panels, forms and tables. No selectors in this group
   apply to the inventory, a live game board, or the marketplace product grid. */
body:is([data-dropso-page=statistics],[data-dropso-page=users],[data-dropso-page=streamers],[data-dropso-page=streamer],[data-dropso-page=profile],[data-dropso-page=level],[data-dropso-page=bonuses],[data-dropso-page=savings],[data-dropso-page=referrals],[data-dropso-page=notifications],[data-dropso-page=suggestions],[data-dropso-page=clans],[data-dropso-page=admin]) main{--ds-card:#1b1928;--ds-card-border:#433552}
body:is([data-dropso-page=statistics],[data-dropso-page=users],[data-dropso-page=streamers],[data-dropso-page=streamer],[data-dropso-page=profile],[data-dropso-page=level],[data-dropso-page=bonuses],[data-dropso-page=savings],[data-dropso-page=referrals],[data-dropso-page=notifications],[data-dropso-page=suggestions],[data-dropso-page=admin]) :where(main>.panel,main>.card,main>section.panel,main>section.card,.split>.panel,.layout>.panel,.bonus-card,.admin-grid>.card){min-width:0;border-color:var(--ds-card-border,#433552);border-radius:var(--ds-radius);background-color:var(--ds-card,#1b1928);box-shadow:0 7px 22px #0002}
body:is([data-dropso-page=statistics],[data-dropso-page=users],[data-dropso-page=streamers],[data-dropso-page=streamer],[data-dropso-page=profile],[data-dropso-page=level],[data-dropso-page=bonuses],[data-dropso-page=savings],[data-dropso-page=referrals],[data-dropso-page=notifications],[data-dropso-page=suggestions],[data-dropso-page=clans],[data-dropso-page=admin]) main :where(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=hidden]),select,textarea){min-width:0;max-width:100%;border-color:#5b486e;border-radius:9px;background-color:#13111d;color:#f6f1fc}
body:is([data-dropso-page=statistics],[data-dropso-page=users],[data-dropso-page=streamers],[data-dropso-page=streamer],[data-dropso-page=profile],[data-dropso-page=level],[data-dropso-page=bonuses],[data-dropso-page=savings],[data-dropso-page=referrals],[data-dropso-page=notifications],[data-dropso-page=suggestions],[data-dropso-page=clans],[data-dropso-page=admin]) main :where(input,textarea)::placeholder{color:#a99bb9;opacity:1}
body:is([data-dropso-page=statistics],[data-dropso-page=streamers],[data-dropso-page=users],[data-dropso-page=streamer],[data-dropso-page=bonuses],[data-dropso-page=savings],[data-dropso-page=clans],[data-dropso-page=suggestions],[data-dropso-page=admin]) :where(.actions,.admin-actions,.bonus-actions,.controls-footer,.history-controls,.social-actions){gap:8px;align-items:center;flex-wrap:wrap}
body:is([data-dropso-page=statistics],[data-dropso-page=streamers],[data-dropso-page=users],[data-dropso-page=streamer],[data-dropso-page=bonuses],[data-dropso-page=savings],[data-dropso-page=clans],[data-dropso-page=suggestions],[data-dropso-page=admin]) :where(.actions,.admin-actions,.bonus-actions,.controls-footer,.history-controls,.social-actions)>:where(button,a){min-height:38px;white-space:normal}
/* Marketplace grid keeps sufficient room for weapon art, wear, price and controls. */
body[data-dropso-page=shop][data-market-design=cards] #grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,max(205px,calc((100% - 60px)/6))),1fr))!important;gap:12px!important;align-items:stretch}
body[data-dropso-page=shop][data-market-design=cards] #grid .item{min-width:0;border:1px solid #4b395f!important;border-radius:13px!important;background:linear-gradient(150deg,#241a34,#151320 82%)!important;box-shadow:none!important}
body[data-dropso-page=shop][data-market-design=cards] #grid .item:hover{border-color:var(--skin-color,#a46de3)!important;transform:none!important}
body[data-dropso-page=shop][data-market-design=cards] #grid .item>img{height:150px!important;object-fit:contain;padding:24px 10px 6px!important}
body[data-dropso-page=shop][data-market-design=cards] #grid .item .name{min-width:0;overflow-wrap:anywhere;font-size:14px!important;line-height:1.35!important}
body[data-dropso-page=shop][data-market-design=cards] #grid .item .coins{margin-top:auto;font-variant-numeric:tabular-nums;color:var(--ds-gold)!important}
body[data-dropso-page=shop] :is(.marketToolbar,.marketToolsLine,.marketTabs){min-width:0;gap:9px}
body[data-dropso-page=shop] :is(#search,#marketSort,.marketButton){min-height:40px}
/* Game catalogue and member cards preserve cover aspect ratios and actual links. */
body[data-dropso-page=games] .games-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,285px),1fr))!important;gap:16px!important;margin-top:18px!important}
body[data-dropso-page=games] .games-grid .game-card{border-radius:15px!important;border-color:#523c6a!important;background:#20182c!important;box-shadow:none!important;min-width:0}
body[data-dropso-page=games] .game-cover{width:100%;height:auto;aspect-ratio:16/9;object-fit:cover}
body[data-dropso-page=games] .game-card-copy{padding:15px!important;min-width:0}
body[data-dropso-page=games] .game-card-copy h2{font-size:20px!important;line-height:1.2}
body[data-dropso-page=streamers] .streamer-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,265px),1fr))!important;gap:14px!important}
body[data-dropso-page=users] .people{grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr))!important;gap:12px!important}
body[data-dropso-page=users] .items{grid-template-columns:repeat(auto-fill,minmax(min(100%,180px),1fr))!important;gap:12px!important}
body[data-dropso-page=users] .person,body[data-dropso-page=streamers] .streamer-grid>*{min-width:0;border-radius:13px;box-shadow:none}
body[data-dropso-page=streamers] .streamer-info,body[data-dropso-page=users] .person>*{min-width:0}
/* Statistics: keep value tiles readable even after the desktop sidebar takes space. */
body[data-dropso-page=statistics] .tiles{grid-template-columns:repeat(auto-fit,minmax(min(100%,175px),1fr))!important;gap:12px!important}
body[data-dropso-page=statistics] .tile{min-width:0;border-radius:12px;font-variant-numeric:tabular-nums}
body[data-dropso-page=statistics] .panel{padding:clamp(14px,1.8vw,22px);margin-top:16px}
body[data-dropso-page=statistics] .split{gap:14px}
body[data-dropso-page=statistics] .economy-story{min-width:0}
/* Admin retains all existing controls; large data tables scroll locally. */
body[data-dropso-page=admin] main{width:100%;max-width:1480px;min-width:0;padding-inline:clamp(12px,2vw,28px)}
body[data-dropso-page=admin] main .tabs{gap:7px;flex-wrap:wrap}
body[data-dropso-page=admin] main .tabs>a,body[data-dropso-page=admin] main .tabs>button{min-height:40px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #5a416f;border-radius:9px;background-color:#2b203d;color:#f4e9ff;font-size:13px;font-weight:700;text-align:center;text-decoration:none;padding:8px 12px;white-space:normal}
body[data-dropso-page=admin] main .tabs>:is(a,button):hover{border-color:#b47af0}
body[data-dropso-page=admin] main :where(table){font-size:13px;line-height:1.45;border-collapse:collapse}
body[data-dropso-page=admin] main :where(th,td){padding:9px 10px;vertical-align:middle;overflow-wrap:anywhere}
body[data-dropso-page=admin] main :where(th){color:#e8d9f7;text-align:left}
body[data-dropso-page=admin] main :where(td){border-bottom-color:#3e334d}
body[data-dropso-page=admin] main tr:hover>td{background-color:#a27ae009}
/* Events and special pages: use a single composition on narrow desktop widths,
   not just when the viewport is phone-sized. */
body[data-dropso-page=major] .bracket-scroll{border-radius:12px}
body[data-dropso-page=major] .tracker{gap:10px;flex-wrap:wrap}
body[data-dropso-page=major] .tracker-item{min-width:0}
body[data-dropso-page=major] .round-nav{gap:7px}
body[data-dropso-page=season] .bpRewardRow{grid-template-columns:repeat(10,minmax(118px,1fr))!important;overflow-x:auto;max-width:100%;min-width:0;overscroll-behavior-inline:contain}
body[data-dropso-page=season] .bpRewardCard{width:104px;justify-self:center;box-shadow:none}
body[data-dropso-page=season] .bpRewardCard.current{box-shadow:0 0 0 1px #b968ff,0 0 18px #9b5de52b}
body[data-dropso-page=level] .roadmap{grid-template-columns:repeat(auto-fill,minmax(min(100%,155px),1fr))!important;gap:10px}
body[data-dropso-page=level] .cosmetics-grid>*{min-width:0}
body[data-dropso-page=advent] .advent-shell{box-sizing:border-box;max-width:100%;min-width:0}
body[data-dropso-page=advent] .day{min-width:0}
body[data-dropso-page=vault] .details-grid>*{min-width:0}
body[data-dropso-page=boss] .boss-main :where(.boss-panel,.boss-hero){border-radius:15px;min-width:0}
body[data-dropso-page=boss] .boss-hero img{max-width:42%;height:auto;object-fit:contain}
body[data-dropso-page=upgrader] :where(.stage,.lists,.up-filters)>*{min-width:0}
body[data-dropso-page=upgrader] .grid .item{min-width:0;overflow-wrap:anywhere}
body[data-dropso-page=upgrader] .grid .item img{max-width:100%;object-fit:contain}
body[data-dropso-page=predict] .match{min-width:0;border-radius:13px}
body[data-dropso-page=predict] .match-footer{flex-wrap:wrap;gap:8px}
body[data-dropso-page=auction] .auction-side,body[data-dropso-page=red-button] .layout>*,body[data-dropso-page=savings] .layout>*,body[data-dropso-page=suggestions] .layout>*,body[data-dropso-page=messages] .community>*{min-width:0}
body[data-dropso-page=messages] .conversation{min-width:0;border-radius:14px}
body[data-dropso-page=messages] .community aside{min-width:0;border-radius:14px}
body[data-dropso-page=legal] main{max-width:900px;padding:24px clamp(16px,3vw,32px) 48px;line-height:1.65}
body[data-dropso-page=legal] main h2{margin-top:24px;line-height:1.3}
@media(min-width:1100px) and (max-width:1350px){
 body[data-dropso-page=auction] .grid{grid-template-columns:minmax(0,1fr) minmax(0,1.3fr)!important}
 body[data-dropso-page=auction] .grid>.chat-panel{grid-column:1/-1}
 body[data-dropso-page=statistics] .split,body[data-dropso-page=suggestions] .layout{grid-template-columns:minmax(0,1fr)!important}
}
@media(max-width:1099px){
 body[data-dropso-page] .dropso-site-layout{padding-inline:0!important}
 body[data-dropso-page] .dropso-site-sidebar{margin:0 12px 10px!important;border:1px solid #3d304d!important;border-radius:14px!important}
 body[data-dropso-page=auction] .grid{grid-template-columns:minmax(0,1fr)!important}
 body[data-dropso-page=shop][data-market-design=cards] #grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,190px),1fr))!important}
}
@media(max-width:760px){
 body[data-dropso-page] main{min-width:0;max-width:100%;margin-inline:auto}
 body[data-dropso-page] .dropso-site-header{padding-inline:12px!important;gap:9px}
 body:is([data-dropso-page=statistics],[data-dropso-page=admin],[data-dropso-page=streamer],[data-dropso-page=bonuses],[data-dropso-page=savings],[data-dropso-page=clans],[data-dropso-page=suggestions],[data-dropso-page=red-button],[data-dropso-page=major]) main :where(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=hidden]),select,textarea){font-size:16px;min-height:42px}
 body:is([data-dropso-page=statistics],[data-dropso-page=suggestions],[data-dropso-page=savings],[data-dropso-page=red-button]) :is(.split,.layout){grid-template-columns:minmax(0,1fr)!important}
 body[data-dropso-page=statistics] .tiles{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px!important}
 body[data-dropso-page=statistics] .tile{padding:12px;min-width:0}
 body[data-dropso-page=admin] main :where(table):not(.table-wrap table):not(.table-scroll table){display:block;overflow-x:auto;max-width:100%;overscroll-behavior-inline:contain}
 body[data-dropso-page=streamer] .control-layout{grid-template-columns:minmax(0,1fr)!important}
 body[data-dropso-page=streamer] .dash-nav{flex-wrap:wrap;gap:7px}
 body[data-dropso-page=major] .panel{padding:12px}
 body[data-dropso-page=level] .roadmap{grid-template-columns:repeat(2,minmax(0,1fr))!important}
}
@media(max-width:620px){
 body[data-dropso-page=shop][data-market-design=cards] #grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px!important}
 body[data-dropso-page=shop][data-market-design=cards] #grid .item>img{height:115px!important;padding:23px 5px 5px!important}
 body[data-dropso-page=shop][data-market-design=cards] #grid .item .name{font-size:12px!important;padding-inline:9px!important}
 body[data-dropso-page=shop][data-market-design=cards] #grid .item .coins{padding-inline:9px!important;font-size:15px!important}
 body[data-dropso-page=users] .items{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px!important}
 body[data-dropso-page=games] .games-grid{grid-template-columns:minmax(0,1fr)!important}
 body[data-dropso-page=streamers] .streamer-grid,body[data-dropso-page=users] .people{grid-template-columns:minmax(0,1fr)!important}
 body[data-dropso-page=admin] main .tabs>a,body[data-dropso-page=admin] main .tabs>button{min-height:44px}
}
@media(prefers-reduced-motion:reduce){body[data-dropso-page] .dropso-site-sidebar a,body[data-dropso-page=shop] #grid .item,body[data-dropso-page=games] .game-card{transition:none!important;transform:none!important}}
</style>`;

export function withDropsoPagePolish(html:string,path:string){
  const kind=dropsoPageKind(path);
  if(!kind||!html.includes('data-dropso-shell')||html.includes('id="dropsoPagePolish"')||!/<body\b/i.test(html))return html;
  const body=html.replace(/<body\b([^>]*)>/i,(_match,attrs)=>`<body${attrs} data-dropso-page="${kind}">`);
  return /<\/head>/i.test(body)?body.replace(/<\/head>/i,()=>css+'</head>'):body.replace(/<body\b/i,()=>css+'<body');
}
