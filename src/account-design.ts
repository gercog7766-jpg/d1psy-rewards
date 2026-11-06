import express from 'express';
import {resolve} from 'node:path';

const banners=`<aside class="account-art-rails" aria-label="Канал D1PSY на Twitch">
<a class="account-art account-art-left" href="https://www.twitch.tv/d1psy_off" target="_blank" rel="noopener noreferrer" aria-label="Смотреть D1PSY на Twitch — откроется в новой вкладке"><img src="/assets/account/twitch-sniper.webp" alt="Фиолетовый персонаж со снайперской винтовкой" width="799" height="1969" decoding="async"><span>TWITCH <b>D1PSY_OFF ↗</b></span></a>
<a class="account-art account-art-right" href="https://www.twitch.tv/d1psy_off" target="_blank" rel="noopener noreferrer" aria-label="Смотреть D1PSY на Twitch — откроется в новой вкладке"><img src="/assets/account/twitch-karambit.webp" alt="Фиолетовый кот с карамбитом" width="799" height="1969" decoding="async"><span>TWITCH <b>D1PSY_OFF ↗</b></span></a>
</aside>`;
const css=String.raw`
body[data-account-design="neon"]{background:radial-gradient(ellipse at 50% 0,#35124a66,transparent 55%),#09070e}
body[data-account-design="neon"] main{position:relative;max-width:1080px;min-height:100vh;margin:0 auto;padding:24px 28px 44px;background:linear-gradient(180deg,#171020f5,#100c18fa 60%,#0d0a13fa);border-inline:1px solid #6d3b913b;box-shadow:0 0 100px #000b}
body[data-account-design="neon"] .top{padding:0 0 18px;border-bottom:1px solid #74419c55;gap:20px;align-items:center;margin-bottom:20px;flex-wrap:wrap}
body[data-account-design="neon"] .top-right{flex:1;justify-content:flex-end;flex-wrap:wrap;gap:10px}
body[data-account-design="neon"] .brand{font-size:12px;letter-spacing:.13em;white-space:nowrap}
body[data-account-design="neon"] .brand-mark{background:linear-gradient(140deg,#772dc9,#241133);border-color:#ad6aff;color:#f1dbff;box-shadow:0 0 22px #9a43ff30}
body[data-account-design="neon"] .economybar{gap:7px;flex-wrap:wrap;align-items:center}
body[data-account-design="neon"] .shoplink{font-size:12px;padding:9px 11px;background:#241530;border-color:#674080;border-radius:8px}
body[data-account-design="neon"] .shoplink:hover{background:#3b1e52;border-color:#c077ff}
body[data-account-design="neon"] .coinbox{border-color:#b48c344d;background:#221b14;border-radius:8px;white-space:nowrap}
body[data-account-design="neon"] .card{background:linear-gradient(135deg,#21142cf2,#15101ff5);border:1px solid #683e805e;border-radius:14px;box-shadow:0 12px 30px #0002}
body[data-account-design="neon"] .card h2{font-size:22px;letter-spacing:-.5px}
body[data-account-design="neon"] .live{padding:16px 20px;background:linear-gradient(110deg,#271638,#191121);border-color:#8f4bb555}
body[data-account-design="neon"] .seasonAccountHero{min-height:192px;padding:26px;border-color:#a14ed1;background:radial-gradient(ellipse at 80% 10%,#973ac04d,transparent 50%),linear-gradient(110deg,#351442,#160e22 70%);box-shadow:inset 0 1px #e6b7ff22,0 12px 30px #0003}
body[data-account-design="neon"] .seasonAccountTitle{font-size:clamp(32px,4vw,52px);letter-spacing:.02em;text-shadow:0 0 28px #ca61ff44}
body[data-account-design="neon"] .seasonAccountS1{top:-12px;right:8%;font-size:180px;color:#e7a7ff0c}
body[data-account-design="neon"] .seasonAccountOpen{background:#8437c4;border-color:#c77cff;border-radius:8px}
body[data-account-design="neon"] .levelWidget{border-radius:12px;background:linear-gradient(100deg,#271637,#191124);padding:16px 18px}
body[data-account-design="neon"] .levelBar{height:7px;background:#0c0813}
body[data-account-design="neon"] .levelFill{background:linear-gradient(90deg,#8a36ef,#e48bff);box-shadow:0 0 16px #b15fff66}
body[data-account-design="neon"] .inventory-tools{gap:12px;padding:12px 0;border-block:1px solid #78519433;margin:16px 0}
body[data-account-design="neon"] .inv-filter{border-radius:7px;background:#1c1327;border-color:#604078;font-size:11px;padding:8px 10px}
body[data-account-design="neon"] .inv-filter.active{background:#7631b4;border-color:#b96aff;color:#fff}
body[data-account-design="neon"] .inventory-search{background:#100b18;border-color:#5b3974;border-radius:8px}
body[data-account-design="neon"] .inventory{grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
body[data-account-design="neon"] .item{min-width:0;border-radius:12px;background:linear-gradient(145deg,#2b193a,#171020);border-color:#694183;transition:border-color .18s,box-shadow .18s}
body[data-account-design="neon"] .item:hover{border-color:#ad65ed;box-shadow:0 0 20px #9a43ff1f}
body[data-account-design="neon"] .item-img{height:132px;background:radial-gradient(ellipse at 50% 55%,#9c4ef322,transparent 70%);border-color:#74429b44}
body[data-account-design="neon"] .item-img img{object-fit:contain}
body[data-account-design="neon"] .item-body{padding:12px 12px 48px}
body[data-account-design="neon"] .item-name{font-size:13px;line-height:1.4}
body[data-account-design="neon"] .actions{flex-wrap:wrap}
body[data-account-design="neon"] .actions button{font-size:11px;min-width:70px}
body[data-account-design="neon"] .d1psy-footer{max-width:1080px;background:#100b17;border-color:#643880;padding:24px 28px;margin:0 auto}
.account-art-rails{display:contents}
.account-art{position:fixed;top:24px;display:block;width:min(300px,calc((100vw - 1080px)/2 - 24px));aspect-ratio:799/1969;max-height:calc(100dvh - 48px);overflow:hidden;background:#0b080e;border:1px solid #9850c76b;border-radius:14px;box-shadow:0 0 36px #9d32f51f;text-decoration:none;z-index:1;transition:border-color .2s,box-shadow .2s}
.account-art-left{right:calc(50% + 552px)}.account-art-right{left:calc(50% + 552px)}
.account-art img{display:block;width:100%;height:100%;object-fit:contain;object-position:center}
.account-art span{position:absolute;bottom:0;left:0;right:0;padding:24px 10px 12px;background:linear-gradient(transparent,#09050def);text-align:center;color:#d9b7f3;font:10px system-ui,sans-serif;letter-spacing:.12em}
.account-art b{display:block;font-size:13px;color:#f0e2ff;letter-spacing:.06em;margin-top:4px}
.account-art:hover,.account-art:focus-visible{border-color:#dc9fff;box-shadow:0 0 32px #aa46ff55;outline:2px solid #dfc1ff;outline-offset:4px}
@media(max-width:1399px){.account-art-rails{display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:1080px;margin:16px auto 0;padding:0 28px}.account-art{position:relative;inset:auto;width:100%;height:120px;max-height:none;aspect-ratio:auto;border-radius:10px}.account-art img{object-fit:cover}.account-art-left img{object-position:50% 34%}.account-art-right img{object-position:50% 64%}.account-art span{left:auto;top:0;bottom:0;width:45%;display:flex;flex-direction:column;justify-content:center;padding:12px;background:linear-gradient(90deg,transparent,#0d0716df 40%);font-size:9px}.account-art b{font-size:12px}}
@media(max-width:760px){body[data-account-design="neon"] main{padding:20px 16px 32px;border:0}body[data-account-design="neon"] .top{align-items:stretch;gap:14px}body[data-account-design="neon"] .top-right{justify-content:space-between;min-width:0}body[data-account-design="neon"] .economybar{justify-content:flex-start;gap:6px}body[data-account-design="neon"] .inventory{grid-template-columns:repeat(2,minmax(0,1fr))}body[data-account-design="neon"] .card{padding:16px}body[data-account-design="neon"] .seasonAccountHero{padding:22px;min-height:205px}body[data-account-design="neon"] .seasonAccountOpen{position:relative;right:auto;bottom:auto;margin-top:16px;display:inline-block}body[data-account-design="neon"] .seasonAccountCopy{width:100%}body[data-account-design="neon"] .d1psy-footer{padding:22px 16px}.account-art-rails{padding:0 16px;gap:10px}.account-art{height:102px}.account-art span{width:55%}.account-art b{font-size:10px}}
@media(max-width:380px){body[data-account-design="neon"] .inventory{grid-template-columns:1fr}.account-art span{width:65%;letter-spacing:0}}
@media(prefers-reduced-motion:reduce){.account-art,body[data-account-design="neon"] .item{transition:none}}
`;

/** Presentation only: no account scripts, handlers or API payloads are replaced. */
export function accountDesignHtml(body:string){
 if(!/<title>Личный кабинет — d1psy Rewards\s*<\/title>/.test(body)||body.includes('id="accountNeonDesign"'))return body;
 return body.replace('</head>','<style id="accountNeonDesign">'+css+'</style></head>')
  .replace(/<body\b([^>]*)>/,'<body$1 data-account-design="neon">'+banners);
}
export function installAccountDesign(){
 const response:any=(express as any).response,send=response.send;
 response.send=function(body:any){if(typeof body==='string')body=accountDesignHtml(body);return send.call(this,body)};
 const proto:any=(express as any).application,listen=proto.listen;
 proto.listen=function(...args:any[]){if(!this.locals.__accountDesignAssets){this.locals.__accountDesignAssets=true;
  for(const name of ['twitch-sniper.webp','twitch-karambit.webp'])this.get('/assets/account/'+name,(_req:any,res:any)=>res.set('Cache-Control','public,max-age=86400').sendFile(resolve('assets','account',name)));
 }return listen.apply(this,args)};
}
