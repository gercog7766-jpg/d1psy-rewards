export const clanPageStyle=String.raw`
body[data-clan-admin="false"]{background:radial-gradient(ellipse at 90% 100%,#271043 0,transparent 28%),radial-gradient(ellipse at 15% 0,#160f25,transparent 46%),#100b1b}
.syndicate-main{max-width:1440px;padding:20px 18px 60px}
.syndicate-main .hero{position:relative;isolation:isolate;min-height:176px;overflow:hidden;padding:32px 44px;display:flex;flex-direction:column;justify-content:center;border:1px solid #78449e;border-radius:25px;background:radial-gradient(ellipse at 80% 75%,#3c145b70,transparent 64%),linear-gradient(120deg,#1c112b,#140d20 60%,#241035);box-shadow:inset 1px 1px 0 #e5a0ff9c,inset -1px -1px 0 #ad44ed8c,0 0 20px #a83cf21c}
.syndicate-main .hero:after{content:'';position:absolute;z-index:-1;right:6%;top:15%;width:31%;height:110%;background:linear-gradient(145deg,#37155d,#9827e2 60%,#391255);mask:url('/pwa/icon/brand-logo.png') center/contain no-repeat;opacity:.31;filter:drop-shadow(0 0 12px #a331ee)}
.syndicate-main .hero h1{font-size:clamp(30px,4.2vw,56px);line-height:1.09;font-weight:950;font-style:italic;letter-spacing:-.03em;margin:0 0 10px;color:#fff}
.syndicate-main .hero h1 span{background:linear-gradient(100deg,#d48bff,#9d29ed);color:transparent;background-clip:text;-webkit-background-clip:text}
.syndicate-main .hero p{font-size:clamp(14px,1.5vw,19px);margin:0;max-width:86%;color:#f9efff}
.syndicate-main .panel{border-radius:23px;padding:26px 36px;margin:24px 0;background:linear-gradient(125deg,#20162d,#170f24);border-color:#7946a0}
.syndicate-main .panel h2{font-size:clamp(19px,2vw,26px);margin:0 0 17px;line-height:1.25;font-weight:850}
.clan-accent{color:#d486ff}
.clan-create-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.16fr) minmax(170px,.72fr);gap:16px;align-items:stretch}
.clan-create-form input,.clan-create-form button{min-height:51px;width:100%;margin:0;border-radius:12px;min-width:0}
.clan-create-form input{background:#20162e;padding:10px 17px}
.clan-create-form input[type=file]{padding:5px 8px;color:#bda9d2}
.clan-create-form input::file-selector-button{border:0;border-radius:8px;background:#352449;color:#fff;padding:10px 13px;margin-right:9px;font:inherit;cursor:pointer}
.syndicate-main .clan-create-form button,.syndicate-main .clan-list-row button{background:linear-gradient(180deg,#8e43c8,#56238d);border-color:#af65ea;box-shadow:inset 0 1px 2px #f3b4ff48,0 0 14px #932ad74b;color:white;font-weight:750}
.syndicate-main .clan-create-form button:hover,.syndicate-main .clan-list-row button:hover{filter:brightness(1.15)}
.syndicate-main .clan-season-panel{position:relative;isolation:isolate;overflow:hidden;border-color:#b44feb;box-shadow:inset 1px 1px 0 #d593ff90,inset -1px -1px 0 #b04aef80,0 0 16px #6c26971a}
.clan-season-panel:before{content:'';position:absolute;z-index:-1;right:-13%;top:-45%;width:63%;height:75%;border-radius:0 0 0 100%;transform:rotate(-24deg);background:linear-gradient(160deg,#2a154400,#8b21cf43);border-bottom:1px solid #b53fed;box-shadow:0 0 22px #ab31ed42;pointer-events:none}
.clan-season-panel h2:before{content:'▥';display:inline-block;margin-right:16px;color:#d183ff;font-size:27px;line-height:1}
.syndicate-main .clan-season-clock{display:inline-flex;align-items:center;gap:10px;padding:10px 18px;margin:4px 0 12px;border:1px solid #7844a0;border-radius:999px;background:#42245155;color:#ddb3ff;font-size:16px}
.syndicate-main .clan-season-clock:before{content:'◷';font-size:20px;color:#e9c3ff;line-height:1}
.clan-season-panel p{margin:12px 0}
.syndicate-main .clan-list-row{display:grid;grid-template-columns:58px minmax(0,1fr) minmax(76px,auto) auto;gap:18px;align-items:center;padding:18px 0;border-bottom:1px solid #6e408b5c}
.clan-list-row:first-of-type{border-top:1px solid #6e408b5c}.syndicate-main .clan-list-row .avatar{width:54px;height:54px;border-radius:12px;border-color:#bc7de5;background:#332047;object-fit:cover}
.clan-list-row strong{font-size:17px;min-width:0;overflow-wrap:anywhere}.clan-list-row .clan-row-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.clan-list-row button{min-width:110px;padding:10px 17px}.clan-list-row .clan-lvl{color:#d9c9e9;white-space:nowrap}
@media(max-width:1050px){.clan-create-form{grid-template-columns:1fr 1fr}.clan-create-form button{grid-column:1/-1}}
@media(max-width:650px){.syndicate-main{padding:8px 12px 32px}.syndicate-main .hero{min-height:142px;padding:23px 20px;border-radius:18px}.syndicate-main .hero h1{font-size:clamp(25px,7vw,37px)}.syndicate-main .hero p{max-width:100%;font-size:14px}.syndicate-main .hero:after{width:45%;right:0;opacity:.15}.syndicate-main .panel{padding:18px 15px;margin:16px 0;border-radius:17px}.syndicate-main .panel h2{margin-bottom:12px}.clan-create-form{grid-template-columns:1fr;gap:9px}.clan-create-form input,.clan-create-form button{min-height:44px}.clan-season-panel h2:before{margin-right:8px;font-size:23px}.syndicate-main .clan-season-clock{font-size:13px;padding:8px 11px}.syndicate-main .clan-list-row{grid-template-columns:44px minmax(0,1fr) auto;gap:9px;padding:12px 0}.syndicate-main .clan-list-row .avatar{width:43px;height:43px}.clan-list-row strong{font-size:14px}.clan-list-row .clan-row-actions{grid-column:2/-1;justify-content:flex-start}.clan-list-row button{min-width:100px;padding:8px 12px}}
`;
