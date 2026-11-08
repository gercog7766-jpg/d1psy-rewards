/** Mobile-only presentation. OBS browser sources keep their fixed broadcast layout. */
export function mobilePage(path:string){
 if(['/obs','/streamer/obs'].includes(path))return null;
 if(path==='/games/night-run')return 'night-run';
 if(path==='/games/defuse')return 'defuse';
 if(path==='/games/minesweeper')return 'minesweeper';
 if(path==='/games/wordly')return 'wordly';
 if(path==='/games/tic-tac-toe')return 'tic-tac-toe';
 if(/^\/users(?:\/[^/]+)?$/.test(path))return 'users';
 if(path==='/community')return 'community';
 if(/^\/admin(?:\/|$)/.test(path))return 'admin';
 if(['/account','/shop','/season','/games','/predict','/upgrader','/contracts','/live','/streamer'].includes(path))return path.slice(1);
 if(['/','/privacy','/terms','/rules','/pwa/offline','/referrals'].includes(path))return 'public';
 return null;
}
export const mobileLayoutCss=String.raw`
@media(max-width:760px){
body[data-mobile-page]{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body[data-mobile-page] :where(main,.wrap,.shell,.layout,.panel,.side,.list,.card,.game,.conversation){min-width:0}
body[data-mobile-page] :where(main,.wrap,.shell){max-width:100%;box-sizing:border-box}
body[data-mobile-page] :where(main,.wrap,.shell){padding-bottom:max(30px,env(safe-area-inset-bottom))}
body[data-mobile-page] :where(h1,h2,h3,p,.hint,.message,.status){overflow-wrap:anywhere}
body[data-mobile-page] :where(nav,.nav,.top,.topnav,.navlinks){flex-wrap:wrap;min-width:0}
body[data-mobile-page] :where(.brand){min-width:0;white-space:normal}
body[data-mobile-page] :where(.back,.navlinks a,.topnav a){min-height:44px;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box}
body[data-mobile-page] :where(input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea){font-size:16px;min-width:0;max-width:100%;box-sizing:border-box}
body[data-mobile-page] :where(input[type=checkbox],input[type=radio]){flex-shrink:0}
body[data-mobile-page] :where(button,a,input,select,textarea){touch-action:manipulation}
body[data-mobile-page] :where(dialog){box-sizing:border-box;max-width:calc(100vw - 24px);max-height:88vh;max-height:88dvh;overflow:auto;overscroll-behavior:contain}
body[data-mobile-page] :where(img,iframe){max-width:100%}
/* DEFUSE: keep the timed device first during a round; four symbols fit one row. */
body[data-mobile-page="defuse"] main{padding:18px 12px 32px}
body[data-mobile-page="defuse"] .nav{gap:10px}
body[data-mobile-page="defuse"] .nav .brand{font-size:11px;letter-spacing:.07em}
body[data-mobile-page="defuse"] .intro{margin:24px 0 18px}
body[data-mobile-page="defuse"] .intro h1{font-size:clamp(25px,7.5vw,34px);letter-spacing:-.8px}
body[data-mobile-page="defuse"] .layout{grid-template-columns:minmax(0,1fr);gap:14px}
body[data-mobile-page="defuse"] .layout.round-active .device{order:-1}
body[data-mobile-page="defuse"] .layout.round-active .side{order:0}
body[data-mobile-page="defuse"] .device{padding:16px 10px;scroll-margin-top:10px}
body[data-mobile-page="defuse"] .plate{gap:8px;flex-wrap:wrap;font-size:9px;letter-spacing:.8px}
body[data-mobile-page="defuse"] .lcd{padding:10px 8px}
body[data-mobile-page="defuse"] .timer{font-size:48px;line-height:1.1}
body[data-mobile-page="defuse"] .modules{gap:5px;margin:10px 0}
body[data-mobile-page="defuse"] .module-light{min-width:0;padding:8px 5px;gap:4px;font-size:10px;overflow-wrap:anywhere}
body[data-mobile-page="defuse"] .module{padding:14px 8px;min-height:280px}
body[data-mobile-page="defuse"] .module h2{font-size:18px}
body[data-mobile-page="defuse"] .module p{font-size:12px;margin-bottom:10px}
body[data-mobile-page="defuse"] .digit{height:34px}
body[data-mobile-page="defuse"] .keypad{gap:5px;margin:10px auto}
body[data-mobile-page="defuse"] .module-actions{margin-top:8px}
body[data-mobile-page="defuse"] .message{min-height:20px;margin-top:8px}
body[data-mobile-page="defuse"] .symbol-keys{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
body[data-mobile-page="defuse"] .symbol-key{width:100%;min-width:0;min-height:76px;padding:6px 3px}
body[data-mobile-page="defuse"] .keypad button,body[data-mobile-page="defuse"] .module-actions button{min-height:44px}
body[data-mobile-page="defuse"] .answer{gap:5px;margin:8px 0;flex-wrap:wrap}
body[data-mobile-page="defuse"] .device-bottom{gap:8px;margin-top:12px;flex-wrap:wrap}
body[data-mobile-page="defuse"] .side{padding:16px 12px}
body[data-mobile-page="defuse"] .levels{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
body[data-mobile-page="defuse"] .level{padding:10px 7px;min-width:0}
body[data-mobile-page="defuse"] .level-top strong{font-size:12px}
/* Minesweeper: scroll the board, never the entire page; retain usable large-field cells. */
body[data-mobile-page="minesweeper"] main{padding:18px 12px 32px}
body[data-mobile-page="minesweeper"] .panel{min-width:0;padding:14px 8px}
body[data-mobile-page="minesweeper"] .levels{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
body[data-mobile-page="minesweeper"] .level{min-width:0;padding:12px 7px}
body[data-mobile-page="minesweeper"] .level small{font-size:11px;line-height:1.5}
body[data-mobile-page="minesweeper"] .toolbar{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;position:sticky;top:8px;z-index:3;padding:8px;background:#150d24;border-radius:10px}
body[data-mobile-page="minesweeper"] .metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;width:100%}
body[data-mobile-page="minesweeper"] .metrics strong{font-size:21px}
body[data-mobile-page="minesweeper"] .metrics small{font-size:10px;letter-spacing:.3px;overflow-wrap:anywhere}
body[data-mobile-page="minesweeper"] .modes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
body[data-mobile-page="minesweeper"] .modes button{min-height:44px;font-size:14px}
body[data-mobile-page="minesweeper"] .board-scroll{width:100%;min-width:0;max-width:100%;overflow:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}
body[data-mobile-page="minesweeper"] .board{margin:16px auto}
body[data-mobile-page="minesweeper"] .actions>button{min-height:44px;flex:1 1 135px}
/* Upgrader: shrink the wheel and its needle together, with search/filter rows below. */
body[data-mobile-page="upgrader"] main{padding:18px 12px 32px}
body[data-mobile-page="upgrader"] .top{flex-direction:column;gap:12px}
body[data-mobile-page="upgrader"] .topnav{width:100%;justify-content:flex-start;gap:8px}
body[data-mobile-page="upgrader"] .stage{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
body[data-mobile-page="upgrader"] .center{grid-column:1/-1;grid-row:1;min-height:0;padding:25px 16px 18px}
body[data-mobile-page="upgrader"] .wheel{--up-wheel-size:min(270px,calc(100vw - 84px));width:var(--up-wheel-size);height:var(--up-wheel-size);flex:none}
body[data-mobile-page="upgrader"] .up-needle{height:calc(var(--up-wheel-size) / 2 + 16px);transform-origin:50% calc(var(--up-wheel-size) / 2 + 16px)}
body[data-mobile-page="upgrader"] .panel{min-width:0;min-height:0;padding:14px}
body[data-mobile-page="upgrader"] .up-title-row{flex-wrap:wrap;gap:7px}
body[data-mobile-page="upgrader"] .panel h2{font-size:18px}
body[data-mobile-page="upgrader"] .selected{height:210px;margin-top:12px}
body[data-mobile-page="upgrader"] .selected.multiSel{height:auto;min-height:228px;padding:7px;gap:6px}
body[data-mobile-page="upgrader"] .selected.multiSel .multiMini img{height:54px!important;max-height:54px!important}
body[data-mobile-page="upgrader"] .multiMini b{font-size:11px}
body[data-mobile-page="upgrader"] .lists{grid-template-columns:minmax(0,1fr);gap:12px}
body[data-mobile-page="upgrader"] .list{min-width:0;min-height:0;padding:13px}
body[data-mobile-page="upgrader"] .listhead{flex-wrap:wrap;gap:8px}
body[data-mobile-page="upgrader"] .search{width:100%;flex:1 1 100%;margin:0;min-height:44px}
body[data-mobile-page="upgrader"] .grid{grid-template-columns:repeat(2,minmax(0,1fr));max-height:58vh;max-height:58dvh;overscroll-behavior:contain}
body[data-mobile-page="upgrader"] .item{min-width:0;padding:9px;min-height:170px;overflow-wrap:anywhere}
body[data-mobile-page="upgrader"] .item img{height:90px}
body[data-mobile-page="upgrader"] .up-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
body[data-mobile-page="upgrader"] .up-filters .up-label,body[data-mobile-page="upgrader"] #sortT{grid-column:1/-1}
body[data-mobile-page="upgrader"] .up-filters input{width:100%;min-height:44px}
body[data-mobile-page="upgrader"] :is(#mulPresets,#pctPresets){display:flex;gap:5px;flex-wrap:wrap;min-width:0}
body[data-mobile-page="upgrader"] .up-filters button{min-height:40px;padding:8px}
body[data-mobile-page="upgrader"] .up-gear,body[data-mobile-page="upgrader"] .up-speed{width:44px;height:44px;flex-basis:44px}
body[data-mobile-page="upgrader"] .result,body[data-mobile-page="upgrader"] .up-settings{padding:12px;overflow:auto;box-sizing:border-box}
body[data-mobile-page="upgrader"] .resultbox,body[data-mobile-page="upgrader"] .up-settings-box{box-sizing:border-box;max-width:100%;max-height:85vh;max-height:85dvh;overflow:auto;padding:20px 16px}
/* Remaining pages: compact navigation, readable inputs and locally scrolling content. */
body[data-mobile-page="games"] .games-grid .card{max-width:100%;margin-top:12px;padding:20px 16px}
body[data-mobile-page="games"] .mini{gap:5px}
body[data-mobile-page="games"] .mini span{min-width:0;flex:1;max-width:42px;font-size:21px}
body[data-mobile-page="wordly"] form{flex-wrap:wrap}
body[data-mobile-page="wordly"] #guess{width:100%;max-width:100%;min-height:44px;flex:1 1 150px}
body[data-mobile-page="wordly"] #submit{min-height:44px}
body[data-mobile-page="wordly"] .keyboard{margin:24px 0}
body[data-mobile-page="wordly"] .keys{gap:3px}
body[data-mobile-page="wordly"] .key{min-width:0;font-size:12px}
body[data-mobile-page="tic-tac-toe"] .layout{grid-template-columns:minmax(0,1fr)}
body[data-mobile-page="tic-tac-toe"] .players{grid-template-columns:repeat(2,minmax(0,1fr))}
body[data-mobile-page="tic-tac-toe"] .player{min-width:0;overflow-wrap:anywhere;padding:10px}
body[data-mobile-page="predict"] .heading{flex-direction:column;align-items:flex-start;gap:12px}
body[data-mobile-page="predict"] .local-note{max-width:100%;text-align:left}
body[data-mobile-page="predict"] .match{min-width:0;padding:17px 13px}
body[data-mobile-page="predict"] .tournament-tabs{display:flex;flex-wrap:wrap}
body[data-mobile-page="predict"] .tournament-tab{flex:1 1 140px;min-width:0;white-space:normal}
body[data-mobile-page="users"] .profile-head{flex-wrap:wrap;gap:12px}
body[data-mobile-page="users"] .profile-head h1{overflow-wrap:anywhere}
body[data-mobile-page="users"] :is(.profile-actions,.privacy-top){flex-wrap:wrap;gap:8px}
body[data-mobile-page="community"] .community{grid-template-columns:minmax(0,1fr)}
body[data-mobile-page="community"] .community aside{max-height:280px;overflow:auto}
body[data-mobile-page="community"] .conversation{padding:14px}
body[data-mobile-page="community"] #messages{height:45vh;height:45dvh;min-height:180px}
body[data-mobile-page="community"] #compose button{min-height:44px}
body[data-mobile-page="contracts"] .workspace{grid-template-columns:minmax(0,1fr)}
body[data-mobile-page="contracts"] .catalogTools{width:100%;flex-wrap:wrap}
body[data-mobile-page="contracts"] .search{width:100%;min-width:0;min-height:44px}
body[data-mobile-page="contracts"] .slotGrid{gap:5px}
body[data-mobile-page="contracts"] .slot{min-width:0}
body[data-mobile-page="shop"] .marketToolbar,body[data-mobile-page="shop"] .marketGoalActions{flex-wrap:wrap}
body[data-mobile-page="shop"] #marketGoal h2{overflow-wrap:anywhere}
body[data-mobile-page="shop"] #modal>.box{box-sizing:border-box;width:calc(100vw - 24px);max-width:100%;max-height:88vh;max-height:88dvh;overflow:auto}
body[data-mobile-page="shop"] .productBody{min-width:0;max-height:none;overflow:visible}
body[data-mobile-page="shop"] .marketModalActions{flex-wrap:wrap}
body[data-mobile-page="account"] .inventory-tools{flex-wrap:wrap}
body[data-mobile-page="account"] .inventory-totals{flex-wrap:wrap;gap:8px}
body[data-mobile-page="account"] .profilecard{box-sizing:border-box;max-width:calc(100vw - 24px);max-height:88vh;max-height:88dvh;overflow:auto}
body[data-mobile-page="account"] .profilehead{gap:8px;flex-wrap:wrap}
body[data-mobile-page="account"] .profileclose,body[data-mobile-page="account"] .legal-close{min-width:44px;min-height:44px}
body[data-mobile-page="account"] .trade-row{flex-wrap:wrap}
body[data-mobile-page="account"] .trade-row input{flex:1 1 180px}
body[data-mobile-page="account"] .dailyDays{grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
body[data-mobile-page="account"] .dailyDay{padding:10px 4px}
body[data-mobile-page="account"] .d1psy-footer .footer-inner{flex-wrap:wrap}
body[data-mobile-page="season"] .hero{min-width:0;padding:22px 16px!important}
body[data-mobile-page="season"] .stats{flex-wrap:wrap}
body[data-mobile-page="season"] .task{min-width:0;overflow-wrap:anywhere}
body[data-mobile-page="live"] .market-head{flex-wrap:wrap}
body[data-mobile-page="live"] .choices{grid-template-columns:repeat(2,minmax(0,1fr))}
body[data-mobile-page="streamer"] .tabs,body[data-mobile-page="admin"] .tabs{flex-wrap:wrap}
body[data-mobile-page="streamer"] .grid,body[data-mobile-page="admin"] .admin-grid{grid-template-columns:minmax(0,1fr)}
body[data-mobile-page="streamer"] :is(.history-row,.promo-row){min-width:0;overflow-wrap:anywhere}
body[data-mobile-page="streamer"] #obsUrl{min-width:0;width:100%;box-sizing:border-box}
body[data-mobile-page="admin"] :where(.row,.controls,.control,.toolbar){flex-wrap:wrap;gap:8px}
body[data-mobile-page="admin"] :where(input,select){max-width:100%}
body[data-mobile-page="admin"] .row>input{flex:1 1 180px}
body[data-mobile-page="admin"] :is(.win,.historyRow){grid-template-columns:minmax(0,1fr)!important;min-width:0;gap:10px;overflow-wrap:anywhere}
body[data-mobile-page="admin"] .trade{white-space:normal;overflow-wrap:anywhere}
body[data-mobile-page="admin"] pre{max-width:100%;overflow:auto;overflow-wrap:anywhere}
}
@media(max-width:480px){
body[data-mobile-page="upgrader"] .stage{grid-template-columns:minmax(0,1fr)}
body[data-mobile-page="upgrader"] .panel h2{font-size:19px}
body[data-mobile-page="contracts"] .itemGrid{grid-template-columns:repeat(2,minmax(0,1fr))}
body[data-mobile-page="contracts"] .shell{padding:18px 12px 30px}
body[data-mobile-page="predict"] .choice{min-width:0;padding:10px 6px;overflow-wrap:anywhere}
}
@media(max-width:840px){
body[data-mobile-page="defuse"] .layout.round-active .device{order:-1}
body[data-mobile-page="defuse"] .layout.round-active .side{order:0}
}
@media(min-width:761px) and (max-width:1100px){
body[data-mobile-page="upgrader"] .stage{grid-template-columns:repeat(2,minmax(0,1fr))}
body[data-mobile-page="upgrader"] .center{grid-column:1/-1;grid-row:1}
body[data-mobile-page="upgrader"] .lists{grid-template-columns:minmax(0,1fr)}
}
`;
export function withMobileLayout(body:string,path:string){
 const page=mobilePage(path);
 if(!page||!/^\s*(?:<!doctype html|<html\b)/i.test(body)||body.includes('id="mobileLayoutTheme"'))return body;
 body=body.replace(/<body\b([^>]*)>/i,`<body$1 data-mobile-page="${page}">`);
 const style='<style id="mobileLayoutTheme">'+mobileLayoutCss+'</style>';
 if(/<\/head>/i.test(body))return body.replace(/<\/head>/i,style+'</head>');
 if(/<body\b/i.test(body))return body.replace(/<body\b/i,style+'<body');
 return body.replace(/<main\b/i,style+`<body data-mobile-page="${page}"><main`);
}
