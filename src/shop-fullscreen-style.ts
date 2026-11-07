import {shopPaginationCss} from './shop-pagination.js';
/** Full-window marketplace presentation; existing product/cart/filter DOM is preserved. */
export const shopFullscreenCss=shopPaginationCss+String.raw`
body[data-night-shift="shop"][data-market-design="cards"]{background:radial-gradient(ellipse at 80% -20%,#5b14a327,transparent 50%),repeating-linear-gradient(135deg,transparent 0 165px,#5f21a20a 166px 210px,transparent 211px 380px),#070510}
body[data-night-shift="shop"][data-market-design="cards"] main{width:100%;max-width:none;margin:0;padding:14px clamp(16px,1.3vw,28px) 46px;box-sizing:border-box}
body[data-night-shift="shop"][data-market-design="cards"] .top{padding:0 3px 13px;margin:0 0 15px;gap:16px;border-bottom-color:#55278044}
body[data-night-shift="shop"][data-market-design="cards"] .mkt-brand-mark{width:40px;height:40px;transform:skew(-14deg);background:transparent;border:0;border-radius:0;color:#a32eff;box-shadow:none;font-size:43px;font-weight:950;line-height:1;text-shadow:0 0 17px #8b24dd55}
body[data-night-shift="shop"][data-market-design="cards"] .brand{gap:12px;font-size:18px;font-weight:850;letter-spacing:.08em}
body[data-night-shift="shop"][data-market-design="cards"] .mkt-brand-sub{font-size:9px;letter-spacing:.35em;color:#c49be9}
body[data-night-shift="shop"][data-market-design="cards"] .mkt-heading{margin:0 3px 12px}
body[data-night-shift="shop"][data-market-design="cards"] .mkt-heading h1{font-size:30px;line-height:1.15;letter-spacing:-.6px}
body[data-night-shift="shop"][data-market-design="cards"] #marketGoal{position:relative;isolation:isolate;overflow:hidden;margin:0 0 14px;padding:16px 20px;border:1px solid #9c36db;border-radius:14px;background:radial-gradient(ellipse at 0 100%,#a527ed6b,transparent 24%),repeating-linear-gradient(134deg,transparent 0 190px,#942de522 191px 193px,transparent 194px 330px),linear-gradient(110deg,#23103e,#0d071d 60%,#19092d);box-shadow:inset 0 0 20px #942fe51a,0 0 15px #8c20c524}
body[data-night-shift="shop"][data-market-design="cards"] #marketGoal:before{content:"D";position:absolute;right:25%;top:-54px;font:950 italic 230px/1 Inter,"Segoe UI",Arial,sans-serif;transform:skew(-15deg);color:#8226cf16;pointer-events:none;z-index:-1}
body[data-night-shift="shop"][data-market-design="cards"] .marketGoalContent{grid-template-columns:135px minmax(0,1fr) 158px;gap:20px;min-height:108px}
body[data-night-shift="shop"][data-market-design="cards"] #marketGoal img{width:135px;height:104px;object-fit:contain;filter:drop-shadow(0 0 18px #a238df2b) drop-shadow(0 8px 8px #0005)}
body[data-night-shift="shop"][data-market-design="cards"] #marketGoal h2{font-size:25px;font-weight:800;line-height:1.15;letter-spacing:-.4px;overflow-wrap:anywhere;margin:4px 0 7px}
body[data-night-shift="shop"][data-market-design="cards"] .marketGoalKicker{font-size:10px;letter-spacing:.14em;color:#db96ff}
body[data-night-shift="shop"][data-market-design="cards"] .marketGoalMeta{font-size:12px;color:#c9b1df}
body[data-night-shift="shop"][data-market-design="cards"] .marketProgress{height:4px;max-width:620px;margin:10px 0 7px;background:#301347}
body[data-night-shift="shop"][data-market-design="cards"] .marketGoalNums{font-size:12px;gap:15px}
body[data-night-shift="shop"][data-market-design="cards"] .marketGoalNums b{color:#ffdc65}
body[data-night-shift="shop"][data-market-design="cards"] #marketGoal .marketGoalStatus{margin:2px 0 0;font-size:12px;font-weight:650;color:#f7db81}
body[data-night-shift="shop"][data-market-design="cards"] .marketGoalActions{gap:6px;min-width:0}
body[data-night-shift="shop"][data-market-design="cards"] .marketGoalActions .marketButton{font-size:12px;padding:9px 12px;border:1px solid #9c38e4;border-radius:9px;background:linear-gradient(130deg,#9024ee,#5a08c7);box-shadow:inset 0 1px #e8baff16,0 0 10px #8c23dc16;color:#fff}
body[data-night-shift="shop"][data-market-design="cards"] .layout{grid-template-columns:220px minmax(0,1fr);gap:20px;margin-top:0;align-items:start}
body[data-night-shift="shop"][data-market-design="cards"] .layout>section{min-width:0}
body[data-night-shift="shop"][data-market-design="cards"] #side{padding:17px 14px;top:14px;border-radius:13px;border:1px solid #683397;background:repeating-linear-gradient(132deg,transparent 0 160px,#7824bd10 161px 163px,transparent 164px 300px),linear-gradient(145deg,#140a29,#0b0719);box-shadow:inset 0 0 20px #6821ac0b}
body[data-night-shift="shop"][data-market-design="cards"] #side h3{font-size:11px;letter-spacing:.08em;color:#d5bde9;margin:18px 0 10px}
body[data-night-shift="shop"][data-market-design="cards"] #side h3:first-child{margin-top:0}
body[data-night-shift="shop"][data-market-design="cards"] #side .opts{gap:7px}
body[data-night-shift="shop"][data-market-design="cards"] #side .opts label{font-size:12px;min-height:22px;color:#c2b1d6}
body[data-night-shift="shop"][data-market-design="cards"] #side input[type=checkbox]{accent-color:#a02dff}
body[data-night-shift="shop"][data-market-design="cards"] .marketToolbar{padding-bottom:10px;gap:12px}
body[data-night-shift="shop"][data-market-design="cards"] .marketToolbar small{font-size:10px;color:#a48ab9;margin-top:5px}
body[data-night-shift="shop"][data-market-design="cards"] .marketTab{padding:8px 12px;font-size:12px;border-color:#63317f;border-radius:9px;background:#160b27}
body[data-night-shift="shop"][data-market-design="cards"] .marketTab.on{background:linear-gradient(130deg,#9a29f1,#640ec9);border-color:#b34fe7;box-shadow:0 0 13px #8b20d82d}
body[data-night-shift="shop"][data-market-design="cards"] #search{height:39px;margin:0 0 11px;border-color:#6d368b;border-radius:10px;background:#0b0617;font-size:13px}
body[data-night-shift="shop"][data-market-design="cards"] .marketToolsLine{margin-bottom:11px;gap:9px}
body[data-night-shift="shop"][data-market-design="cards"] :is(.marketToolsLine label,#marketSort,.marketCount){font-size:12px}
body[data-night-shift="shop"][data-market-design="cards"] #weaponFilters{margin-bottom:12px;border:1px solid #70348e;border-radius:10px;background:linear-gradient(180deg,#29103f,#170a29);box-shadow:inset 0 1px #cf90ff12}
body[data-night-shift="shop"][data-market-design="cards"] .wf summary{padding:10px 9px;color:#d3b5e6;font-size:12px}
body[data-night-shift="shop"][data-market-design="cards"] #grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
body[data-night-shift="shop"][data-market-design="cards"] #grid .item{border:1px solid #7834a0;border-radius:13px;background:radial-gradient(ellipse at 50% 10%,#6827a529,transparent 72%),linear-gradient(150deg,#180b30,#0b0618 78%);box-shadow:inset 0 0 0 1px #8d3abd0b,0 3px 12px #0002}
body[data-night-shift="shop"][data-market-design="cards"] #grid .item:before{height:1px;opacity:.8}
body[data-night-shift="shop"][data-market-design="cards"] #grid .item:hover{border-color:#bd61f4;box-shadow:0 0 20px #9023d82b,0 8px 22px #0004;transform:translateY(-2px)}
body[data-night-shift="shop"][data-market-design="cards"] #grid .item>img{height:clamp(126px,10.6vw,178px);padding:24px 12px 3px;filter:drop-shadow(0 7px 8px #0008)}
body[data-night-shift="shop"][data-market-design="cards"] #grid .item .name{padding:8px 14px 0;font-size:15px;line-height:1.3}
body[data-night-shift="shop"][data-market-design="cards"] .mkt-model{font-size:10px;letter-spacing:.06em;margin-bottom:3px;color:#b5a1cc}
body[data-night-shift="shop"][data-market-design="cards"] .mkt-finish{font-size:15px;font-weight:650;line-height:1.35;color:#f7edff;letter-spacing:-.2px}
body[data-night-shift="shop"][data-market-design="cards"] #grid .item .coins{font-size:18px;line-height:1.2;padding:5px 14px 12px;color:#ffe36e}
body[data-night-shift="shop"][data-market-design="cards"] .mkt-currency{font-size:10px;color:#d7bd8b}
body[data-night-shift="shop"][data-market-design="cards"] .mkt-card-tag{font-size:8px;letter-spacing:.03em;left:11px;top:12px;padding:3px 5px;background:#3017489c;border-radius:4px}
body[data-night-shift="shop"][data-market-design="cards"] #grid .marketCardActions{top:8px;right:8px;gap:5px}
body[data-night-shift="shop"][data-market-design="cards"] #grid .marketIcon{width:26px;height:26px;border-color:#784697;background:#150823cc;border-radius:6px;color:#d6b0ec}
body[data-night-shift="shop"][data-market-design="cards"] #marketNotice:empty{display:none}
body[data-night-shift="shop"][data-market-design="cards"] #grid .item .coins:before{content:"";display:inline-block;width:14px;height:14px;margin-right:5px;vertical-align:-1px;background:center/contain no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%23ffdf63' stroke-width='1.6'%3E%3Cellipse cx='10' cy='5' rx='7' ry='3'/%3E%3Cpath d='M3 5v5c0 1.7 3.1 3 7 3s7-1.3 7-3V5M3 10v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M10 8v10'/%3E%3C/svg%3E")}
@media(min-width:1700px){body[data-night-shift="shop"][data-market-design="cards"] #grid{grid-template-columns:repeat(5,minmax(0,1fr))}}
@media(min-width:2300px){body[data-night-shift="shop"][data-market-design="cards"] #grid{grid-template-columns:repeat(6,minmax(0,1fr))}}
@media(max-width:1180px) and (min-width:901px){body[data-night-shift="shop"][data-market-design="cards"] .layout{grid-template-columns:195px minmax(0,1fr);gap:15px}body[data-night-shift="shop"][data-market-design="cards"] #grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:900px){body[data-night-shift="shop"][data-market-design="cards"] main{padding:16px 16px 36px}body[data-night-shift="shop"][data-market-design="cards"] .layout{grid-template-columns:1fr;gap:14px}body[data-night-shift="shop"][data-market-design="cards"] #grid{grid-template-columns:repeat(3,minmax(0,1fr))}body[data-night-shift="shop"][data-market-design="cards"] .marketGoalContent{grid-template-columns:95px minmax(0,1fr);gap:15px}body[data-night-shift="shop"][data-market-design="cards"] #marketGoal img{width:95px;height:95px}body[data-night-shift="shop"][data-market-design="cards"] .marketGoalActions{grid-column:1/-1;display:flex;flex-wrap:wrap}body[data-night-shift="shop"][data-market-design="cards"] .marketGoalActions>*{flex:1;min-width:130px}body[data-night-shift="shop"][data-market-design="cards"] #side{max-height:none;overflow:visible}}
@media(max-width:580px){body[data-night-shift="shop"][data-market-design="cards"] main{padding:14px 12px 30px}body[data-night-shift="shop"][data-market-design="cards"] .top{gap:13px;margin-bottom:16px}body[data-night-shift="shop"][data-market-design="cards"] .brand{font-size:15px}body[data-night-shift="shop"][data-market-design="cards"] .mkt-brand-mark{width:32px;height:32px;font-size:35px}body[data-night-shift="shop"][data-market-design="cards"] .mkt-heading h1{font-size:27px}body[data-night-shift="shop"][data-market-design="cards"] #marketGoal{padding:17px 15px}body[data-night-shift="shop"][data-market-design="cards"] #marketGoal h2{font-size:20px}body[data-night-shift="shop"][data-market-design="cards"] .marketGoalContent{grid-template-columns:66px minmax(0,1fr);gap:12px}body[data-night-shift="shop"][data-market-design="cards"] #marketGoal img{width:66px;height:75px}body[data-night-shift="shop"][data-market-design="cards"] .marketGoalNums{flex-wrap:wrap;gap:3px 15px;font-size:11px}body[data-night-shift="shop"][data-market-design="cards"] .marketGoalActions>*{min-width:110px}body[data-night-shift="shop"][data-market-design="cards"] #grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}body[data-night-shift="shop"][data-market-design="cards"] #grid .item>img{height:132px;padding:26px 8px 3px}body[data-night-shift="shop"][data-market-design="cards"] #grid .item .name{padding:9px 11px 0}body[data-night-shift="shop"][data-market-design="cards"] .mkt-finish{font-size:14px}body[data-night-shift="shop"][data-market-design="cards"] #grid .item .coins{font-size:18px;padding:7px 11px 12px}body[data-night-shift="shop"][data-market-design="cards"] .marketTab{font-size:11px;padding:8px 10px}}
`;
