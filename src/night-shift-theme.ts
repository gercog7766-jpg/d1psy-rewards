import express from 'express';

/** Shared presentation only. Never targets admin, OBS, API or script responses. */
export function nightShiftPage(path:string){
 if(['/shop','/season','/games','/predict','/upgrader','/contracts','/live'].includes(path))return path.slice(1);
 if(/^\/games\/(wordly|tic-tac-toe|minesweeper|defuse)$/.test(path))return 'games';
 if(/^\/users(?:\/[^/]+)?$/.test(path)||path==='/community')return 'users';
 return null;
}
export const nightShiftCss=String.raw`
body[data-night-shift]{--ns-bg:#070611;--ns-panel:#100c23;--ns-deep:#0a0818;--ns-border:#543182;--ns-violet:#a02dff;--ns-text:#f5f2ff;--ns-muted:#b6a5ce;--bg:#070611;--panel:#100c23;--line:#543182;--accent:#a02dff;--text:#f5f2ff;--muted:#b6a5ce;min-height:100vh;background:radial-gradient(ellipse at 65% -10%,#7125c32a,transparent 50%),radial-gradient(ellipse at 0 60%,#39116e14,transparent 45%),var(--ns-bg);color:var(--ns-text);font-family:Inter,"Segoe UI",Arial,sans-serif;-webkit-font-smoothing:antialiased;color-scheme:dark}
body[data-night-shift] :where(main,.wrap,.shell){position:relative}
body[data-night-shift] :where(h1,h2,h3){font-family:inherit;line-height:1.2;color:var(--ns-text);text-wrap:balance}
body[data-night-shift] h1{font-size:clamp(30px,3.6vw,42px);font-weight:850;letter-spacing:-1.2px}
body[data-night-shift] :where(h2){letter-spacing:-.45px;font-weight:750}
body[data-night-shift] :where(.eyebrow,.marketGoalKicker){color:#c191ec;letter-spacing:.19em;font-size:11px;font-weight:700}
body[data-night-shift] :where(.muted,.hint,.sub,.footnote,.bottomNote,.local-note){color:var(--ns-muted)}
body[data-night-shift] :where(.nav,.top){border-bottom-color:#51317266}
body[data-night-shift] :where(.brand){color:#f6eeff;font-weight:850;letter-spacing:.09em}
body[data-night-shift] :where(.back,.navlinks a,.topnav a,.nav>a:not(.brand),.nav .nav a){border-color:#614083;background:linear-gradient(145deg,#171026,#0c0918);border-radius:10px;color:#eadcf8;box-shadow:inset 0 1px #ffffff08}
body[data-night-shift] :where(.back,.navlinks a,.topnav a):hover{border-color:#a452e8;color:#fff}
body[data-night-shift] :where(input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea){background-color:#090716;border-color:#503566;color:#f2e9ff;border-radius:10px;font-family:inherit;accent-color:#a02dff}
body[data-night-shift] :where(input,textarea)::placeholder{color:#9582ad;opacity:1}
body[data-night-shift] :where(a,button,input,select,textarea,[tabindex]):focus-visible{outline:2px solid #ce8aff;outline-offset:3px}
body[data-night-shift] :where(button){font-family:inherit;touch-action:manipulation}
body[data-night-shift] :where(.primary,.play,.save,.go,.marketButton,#mb){border-color:#b452ef;background:linear-gradient(130deg,#962be9,#651ac2);color:#fff;box-shadow:0 5px 18px #8126df2b;border-radius:10px;font-weight:750}
body[data-night-shift] :where(.primary,.play,.save,.go,.marketButton,#mb):hover:not(:disabled){filter:brightness(1.12)}
body[data-night-shift] :where(.secondary,.retry,.clear,.pg,.pager button){border-color:#624080;background:#191026;color:#dfc9f3;border-radius:10px}
body[data-night-shift] :where(.tab.on,.tournament-tab[aria-selected=true],.marketTab.on,.pg.on,.pager button.active,.navlinks a.active){border-color:#b452ef;background:linear-gradient(135deg,#982bea,#651ac2);color:#fff;box-shadow:0 0 14px #9327ed24}
body[data-night-shift] :where(.notice){background:#130d24;border-color:#644084;color:#cdb5df;border-radius:12px}
body[data-night-shift] :where(.card,.panel,.game,.person,.profile-head,.public-goal,.profile-level,.market,.bet-slip,.history,.machine,.summary,.catalog,.dialogInner,.resultbox){border-color:var(--ns-border);background:linear-gradient(135deg,#140d2c,#0b081a 78%);border-radius:17px;box-shadow:0 12px 30px #0003,inset 0 1px #b879ff08}
body[data-night-shift] :where(.card h2,.panel h2,.market h2){font-size:22px}
body[data-night-shift] :where(.profile-level-track,.marketProgress,.taskProgress){background:#261342}
body[data-night-shift] :where(.profile-level-fill,.marketProgress i,.taskProgress i){background:linear-gradient(90deg,#8925ff,#c43dff);box-shadow:0 0 12px #a52eff44}
body[data-night-shift] :where(.empty,.emptyCatalog){border-color:#4b2c6b;background:#0d091b;color:#b3a0c8;border-radius:14px}
/* Marketplace: keep its grid, live prices, rarity rails and product controls. */
body[data-night-shift="shop"][data-market-design="cards"] main{background:linear-gradient(180deg,#0b08142b,transparent)}
body[data-night-shift="shop"][data-market-design="cards"] :is(#side,#marketGoal,.box){background:linear-gradient(140deg,#130d28,#0b081a);border-color:#543182;border-radius:17px}
body[data-night-shift="shop"][data-market-design="cards"] #marketGoal{background:radial-gradient(ellipse at 100% 0,#6020a52e,transparent 60%),linear-gradient(125deg,#160d2c,#0c081a);box-shadow:0 0 24px #7223c012,inset 0 1px #c68aff10}
body[data-night-shift="shop"][data-market-design="cards"] #marketGoal h2{color:#f5efff;font-size:23px;font-weight:800}
body[data-night-shift="shop"][data-market-design="cards"] .mkt-heading h1{font-size:32px;font-weight:850}
body[data-night-shift="shop"][data-market-design="cards"] #grid .item{background:linear-gradient(150deg,#160e30,#0b081a 78%);border-color:#553185;border-radius:15px;box-shadow:inset 0 1px #bc8aff0b}
body[data-night-shift="shop"][data-market-design="cards"] #grid .item:hover{border-color:color-mix(in srgb,var(--skin-color) 70%,#9b46e1);box-shadow:0 0 23px #8d27e226,0 14px 26px #0004}
body[data-night-shift="shop"][data-market-design="cards"] #grid .item .name{font-size:16px;line-height:1.45}
body[data-night-shift="shop"][data-market-design="cards"] .mkt-finish{color:#f2eaff;font-weight:650;letter-spacing:-.2px}
body[data-night-shift="shop"][data-market-design="cards"] .mkt-model{color:#b3a0cb;letter-spacing:.07em}
body[data-night-shift="shop"][data-market-design="cards"] #grid .item .coins{color:#ffda79;text-shadow:0 0 15px #ffd43b18}
body[data-night-shift="shop"][data-market-design="cards"] :is(#search,#marketSort,.price input){background:#0b081a;border-color:#503367}
body[data-night-shift="shop"][data-market-design="cards"] :is(.marketTab,.wfmenu,.wear,.tab){background:#130d22;border-color:#58337d;color:#c9b3df}
body[data-night-shift="shop"][data-market-design="cards"] :is(.marketTab.on,.on.wear,.on.tab,#mb){background:linear-gradient(130deg,#962be9,#651ac2);border-color:#b452ef;color:#fff}
body[data-night-shift="shop"][data-market-design="cards"] .productHead{background:radial-gradient(ellipse at 0 0,#8327c530,transparent 65%),#120c25}
body[data-night-shift="shop"][data-market-design="cards"] .productVisual{background:radial-gradient(ellipse at 50% 65%,#7622bc24,transparent 70%),#0c081a;border-color:#59337f}
body[data-night-shift="shop"][data-market-design="cards"] :is(.mkt-brand-mark,.marketIcon.on){background:linear-gradient(135deg,#a02dff,#5620a2);border-color:#b96bed}
/* Night Shift: abstract banner, luminous reward track, readable tasks. */
body[data-night-shift="season"] .hero{position:relative;overflow:hidden;isolation:isolate;background:radial-gradient(ellipse at 100% 100%,#7b12ff60,transparent 48%),repeating-linear-gradient(133deg,transparent 0 180px,#7227cb24 181px 183px,transparent 184px 310px),linear-gradient(112deg,#190c33,#090716 68%)!important;border-color:#9a39ef;box-shadow:0 0 24px #8321ce24,inset 0 0 30px #8321ce10!important}
body[data-night-shift="season"] .hero:after{content:"S1";position:absolute;right:1%;top:-24px;font-size:clamp(120px,18vw,240px);font-weight:950;font-style:italic;letter-spacing:-.12em;color:#7826c82a;z-index:-1;pointer-events:none}
body[data-night-shift="season"] .hero h1{font-style:italic;font-size:clamp(40px,6.5vw,72px);line-height:1;letter-spacing:-.045em;text-shadow:0 0 24px #ac40ff30}
body[data-night-shift="season"] :is(.stat,.notice){background:#100b23!important;border-color:#5b3483!important;color:#d4bfeb!important;border-radius:13px}
body[data-night-shift="season"] .tab{background:#100b21!important;border-color:#59337f!important;border-radius:10px}
body[data-night-shift="season"] .tab.on{background:linear-gradient(130deg,#962be9,#651ac2)!important;border-color:#b452ef!important;box-shadow:0 0 15px #9225ee30!important}
body[data-night-shift="season"] .task{background:linear-gradient(140deg,#160e30,#0c081b)!important;border-color:#543182!important;border-radius:15px;box-shadow:inset 0 1px #be89ff08!important}
body[data-night-shift="season"] .task.done{border-color:#a554d9!important;background:linear-gradient(140deg,#28113f,#120b25)!important}
body[data-night-shift="season"] .bpRewardCard{background:linear-gradient(155deg,#1b1038,#0c081b);border-color:#5a347f;border-radius:14px}
body[data-night-shift="season"] .bpRewardCard.current{border-color:#d28bff;box-shadow:0 0 0 1px #a843f0,0 0 25px #9b2bdb66;background:linear-gradient(155deg,#3d1661,#170b29)}
body[data-night-shift="season"] .bpRewardCard.unlocked{border-color:#a755de;box-shadow:0 0 15px #8c2bd62b}
/* Games: cover cards use the same abstract surfaces. Board states are untouched. */
body[data-night-shift="games"] .games-grid .card{position:relative;overflow:hidden;background:radial-gradient(ellipse at 100% 0,#8123d624,transparent 65%),linear-gradient(135deg,#160e30,#0b081a);border-color:#67388b;border-radius:18px;box-shadow:inset 0 1px #c080ff0d}
body[data-night-shift="games"] .games-grid .card:hover{border-color:#a54ee1;box-shadow:0 0 22px #9a2dda21}
body[data-night-shift="games"] .games-grid h2{font-size:25px;letter-spacing:-.55px}
body[data-night-shift="games"] .games-grid p{color:#c7b7db;line-height:1.65}
body[data-night-shift="games"] :is(.device,.side,.rules,.invite,.roomrow,.player){border-color:#533178;background-color:#100a21}
body[data-night-shift="games"] :is(.play,.primary){background:linear-gradient(130deg,#982bea,#651ac2);border:1px solid #ae57e4;box-shadow:0 0 16px #8827d626}
/* Match surfaces: outcome, winner/loser and player-answer colours remain semantic. */
body[data-night-shift="predict"] .match{background:radial-gradient(ellipse at 100% 0,#6521a41c,transparent 60%),linear-gradient(135deg,#140d2c,#0b081a);border-color:#583382;border-radius:18px;box-shadow:inset 0 1px #b67bff0b}
body[data-night-shift="predict"] .tournament-tabs{gap:10px}
body[data-night-shift="predict"] .tournament-tab{background:#120b23;border-color:#5d3481;border-radius:11px;color:#cdb7e5}
body[data-night-shift="predict"] .tournament-tab[aria-selected=true]{background:linear-gradient(130deg,#962be9,#651ac2);border-color:#b452ef;box-shadow:0 0 16px #9426ed24;color:#fff}
body[data-night-shift="predict"] .choice.selected:not(.result-win):not(.result-loss){background:linear-gradient(130deg,#7721b9,#511889);border-color:#ad58de;color:#f5eaff}
body[data-night-shift="predict"] :is(.format,.datetime){color:#decef2}
body[data-night-shift="predict"] .divider{color:#b9a1d1}
/* Upgrader: style the housing, preserve wheel arcs, needle, animation and probability. */
body[data-night-shift="upgrader"] :is(.stage,.panel,.resultbox){background:radial-gradient(ellipse at 50% 0,#7622b51b,transparent 65%),linear-gradient(135deg,#140d2c,#0b081a);border-color:#5e3588;border-radius:18px}
body[data-night-shift="upgrader"] .wheel{background:#0e0920!important;border-color:#583582;box-shadow:0 0 32px #8f26df20,inset 0 0 20px #0005}
body[data-night-shift="upgrader"] .wheel:after{background:conic-gradient(from 0deg,#a02dff 0 var(--p,0%),#27143d var(--p,0%) 100%)!important}body[data-night-shift="upgrader"] .wheel:before{background:#0c081b!important;border-color:#543182!important}
body[data-night-shift="upgrader"] .item{background:#100b23;border-color:#50306c;border-radius:12px}
body[data-night-shift="upgrader"] .item.on{background:linear-gradient(140deg,#34134f,#180c2c);border-color:#b45ee8;box-shadow:0 0 15px #9b2dd52b}
body[data-night-shift="upgrader"] .go{background:linear-gradient(130deg,#a02dff,#6418be);border:1px solid #ba62ef;box-shadow:0 0 20px #8b25db30}
/* Contract workshop, confirmation and result dialogs share the palette. */
body[data-night-shift="contracts"] :is(.machine,.catalog,.summary,.dialogInner){background:radial-gradient(ellipse at 100% 0,#7023b21a,transparent 60%),linear-gradient(135deg,#140d2c,#0b081a);border-color:#603587;border-radius:18px}
body[data-night-shift="contracts"] .slot{background:#0b081b;border-color:#48285f;border-radius:12px}
body[data-night-shift="contracts"] .slot.filled{background:linear-gradient(145deg,#2d1149,#160c29);border-color:#9f4bcd}
body[data-night-shift="contracts"] .catalog .item{background:#100a22;border-color:#4e2e6e;border-radius:12px}
body[data-night-shift="contracts"] .catalog .item.on{background:#29113f;border-color:#b45ee8;box-shadow:0 0 14px #9b2dd524}
body[data-night-shift="contracts"] :is(.resultPrice,.sum .value){color:#ffda79}
body[data-night-shift="contracts"] .brandIcon{background:linear-gradient(135deg,#a02dff,#52209a);border-color:#bd6bf0}
/* Directory and profiles: retain online/privacy indicators and goal progress. */
body[data-night-shift="users"] :is(.person,.profile-head,.public-goal,.profile-level,.privacy){background:radial-gradient(ellipse at 100% 0,#7124b11a,transparent 60%),linear-gradient(135deg,#140d2c,#0b081a);border-color:#593382;border-radius:15px;box-shadow:inset 0 1px #b879ff08}
body[data-night-shift="users"] .person:hover{border-color:#a251ce;box-shadow:0 0 18px #952ad31f}
body[data-night-shift="users"] .person strong{font-size:15px;color:#f6edff}
body[data-night-shift="users"] .items .item{background:linear-gradient(150deg,#160e30,#0b081a);border-color:#543182;border-radius:14px}
body[data-night-shift="users"] .profile-level{border-color:#9252c6;box-shadow:0 0 15px #9f2bd421}
body[data-night-shift="users"] .public-goal{background:radial-gradient(ellipse at 100% 0,#8529bd24,transparent 70%),#110a23}
/* Live: distinguish closed, selected and settled states; keep displayed odds legible. */
body[data-night-shift="live"] .hero{background:radial-gradient(ellipse at 100% 100%,#7423bc30,transparent 55%),linear-gradient(125deg,#190d32,#0b081a);border-color:#803cae;border-radius:18px;box-shadow:0 0 23px #8926c91a}
body[data-night-shift="live"] :is(.market,.bet-slip,.history){background:linear-gradient(135deg,#150d2d,#0b081a);border-color:#5b3282;border-radius:16px}
body[data-night-shift="live"] .outcome:not(.winner):not(.loser){background:#0c081c;border-color:#4e2d6c;border-radius:11px}
body[data-night-shift="live"] .outcome.selected:not(.winner):not(.loser){background:linear-gradient(135deg,#662099,#351052);border-color:#bd64ed;box-shadow:0 0 12px #a439d724}
body[data-night-shift="live"] .odds{color:#f1d182;font-variant-numeric:tabular-nums}
body[data-night-shift="live"] :is(.team-logo,.bet-form){border-color:#55327b;background-color:#0d091d}
body[data-night-shift] ::selection{background:#7e22ce;color:#fff}
@media(max-width:760px){body[data-night-shift] h1{font-size:32px;letter-spacing:-.8px}body[data-night-shift] :where(.intro){margin-top:26px}body[data-night-shift="games"] .games-grid h2{font-size:23px}body[data-night-shift="shop"][data-market-design="cards"] .mkt-heading h1{font-size:28px}body[data-night-shift="shop"][data-market-design="cards"] #marketGoal h2{font-size:20px}}
@media(prefers-reduced-motion:reduce){body[data-night-shift] :where(.game,.person){transition:none}}
`;
export function nightShiftHtml(body:string,path:string){
 const page=nightShiftPage(path);
 if(!page||!/^\s*(?:<!doctype html|<html\b)/i.test(body)||body.includes('id="nightShiftTheme"'))return body;
 return body.replace(/<body\b([^>]*)>/i,`<body$1 data-night-shift="${page}">`).replace('</head>','<style id="nightShiftTheme">'+nightShiftCss+'</style></head>');
}
export function installNightShiftTheme(){
 const response:any=(express as any).response,send=response.send;
 response.send=function(body:any){if(typeof body==='string')body=nightShiftHtml(body,this.req?.path||'');return send.call(this,body)};
}
