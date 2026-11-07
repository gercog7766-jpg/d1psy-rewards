/** Presentation-only upgrade. Keep existing IDs and event handlers intact. */
export function separateAccountBlocks(body:string){
 // Legacy account polling still writes these nodes. Keep inert compatibility hooks,
 // while removing the entire giveaway card from the visible page.
 body=body.replace(/<section class="card live">[\s\S]*?<\/section>/, '<div id="accountGiveawayHooks" hidden aria-hidden="true"><span id="liveMain"></span><span id="liveHint"></span><span id="liveProgress"></span><span id="tradeReady"></span></div>');
 const start=body.indexOf('<div id="dailyBonusCard"');
 if(start>=0){
  const tags=/<\/?div\b[^>]*>/g;tags.lastIndex=start;let depth=0,end=-1,m;
  while((m=tags.exec(body))){depth+=m[0].startsWith('</')?-1:1;if(depth===0){end=tags.lastIndex;break}}
  if(end>start){const bonus=body.slice(start,end);body=body.slice(0,start)+body.slice(end);const inventory=body.indexOf('id="inventory"');const section=inventory>=0?body.lastIndexOf('<section',inventory):-1;if(section>=0)body=body.slice(0,section)+bonus+body.slice(section);}
 }
 return body.replace('class="seasonAccountTitle">NIGHT SHIFT</div>', 'class="seasonAccountTitle">NIGHT <span>SHIFT</span></div>');
}
export const accountRebrandCss=String.raw`
body[data-account-design="neon"]{background:radial-gradient(ellipse at 55% 0,#39116e35,transparent 55%),#070611;color:#f5f2ff;font-family:Inter,"Segoe UI",Arial,sans-serif;-webkit-font-smoothing:antialiased}
body[data-account-design="neon"] main{background:linear-gradient(180deg,#0b0818fa,#080711fa);border-color:#6d3b9130}
body[data-account-design="neon"] .card{background:linear-gradient(120deg,#100c23,#090818);border:1px solid #46306b;border-radius:17px;box-shadow:0 14px 36px #0003}
body[data-account-design="neon"] .card h2{font-size:26px;letter-spacing:-.6px;font-weight:800;line-height:1.2}
body[data-account-design="neon"] .shoplink{background:linear-gradient(145deg,#171026,#0c0918);border-color:#614083;box-shadow:inset 0 1px #ffffff08}
body[data-account-design="neon"] .seasonAccountHero{min-height:204px;border:1px solid #9a39ef;border-radius:17px;padding:30px 32px;background:radial-gradient(ellipse at 100% 100%,#7b12ff75,transparent 44%),radial-gradient(ellipse at 0 0,#a92bed40,transparent 43%),repeating-linear-gradient(133deg,transparent 0 158px,#6121ba1c 159px 161px,transparent 162px 310px),linear-gradient(112deg,#160b2e,#090716 65%);box-shadow:inset 0 0 25px #831bda18,0 0 22px #841cff24}
body[data-account-design="neon"] .seasonAccountHero:after{content:"";position:absolute;right:17%;top:-90px;width:90px;height:410px;transform:rotate(42deg);background:linear-gradient(90deg,transparent,#7625e91c);border-right:1px solid #ad45ff39;pointer-events:none;z-index:-1}
body[data-account-design="neon"] .seasonAccountCopy{width:calc(100% - 190px)}
body[data-account-design="neon"] .seasonAccountEyebrow{font-size:12px;letter-spacing:.2em;color:#c3afd9;display:flex;align-items:center;gap:16px}
body[data-account-design="neon"] .seasonAccountEyebrow:after{content:"";width:70px;height:2px;background:linear-gradient(90deg,#bf39f1,transparent)}
body[data-account-design="neon"] .seasonAccountTitle{font-size:clamp(38px,5.9vw,66px);font-style:italic;letter-spacing:-.045em;line-height:1.05;font-weight:950;margin:14px 0 17px;white-space:nowrap;text-shadow:0 0 26px #9e46ef22}
body[data-account-design="neon"] .seasonAccountTitle span{color:#b446ff;background:linear-gradient(110deg,#d260ff,#8524f7);background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent}
body[data-account-design="neon"] .seasonAccountMeta{font-size:12px;gap:12px 20px;color:#bdb3d1}
body[data-account-design="neon"] .seasonAccountProgress{height:6px;background:#261342;margin-top:18px}
body[data-account-design="neon"] .seasonAccountProgress i{background:linear-gradient(90deg,#8425ff,#c43dff);box-shadow:0 0 12px #ac35ff77}
body[data-account-design="neon"] .seasonAccountS1{font-size:196px;top:-16px;right:0;color:#6a20ca30;transform:skew(-10deg);font-weight:950;letter-spacing:-.1em;line-height:1.1}
body[data-account-design="neon"] .seasonAccountOpen{right:24px;bottom:24px;font-size:11px;padding:13px 16px;background:linear-gradient(135deg,#641c9f88,#271041);border-color:#bf3dff;box-shadow:0 0 18px #9f20ff44,inset 0 0 10px #8b1ab333;border-radius:11px;letter-spacing:0}
body[data-account-design="neon"] .levelWidget{position:relative;padding:18px 22px;border:1px solid #a74aff;border-radius:16px;background:radial-gradient(ellipse at 0 50%,#7723c12a,transparent 40%),#0d091d;box-shadow:0 0 18px #a22aff40,inset 0 0 15px #9c35ff0a;margin:18px 0}
body[data-account-design="neon"] .levelBadge{font-size:21px;font-weight:900;color:#ffdc6e;text-shadow:0 0 15px #ffc93622}
body[data-account-design="neon"] .levelText{font-size:13px;color:#cec3e1;font-variant-numeric:tabular-nums}
body[data-account-design="neon"] .levelBar{height:7px;border-radius:10px;background:#26113d;margin-top:12px}
body[data-account-design="neon"] .levelFill{background:linear-gradient(90deg,#8c25ff,#c245ff);box-shadow:0 0 13px #b230ff70}
body[data-account-design="neon"] .dailyBonus{margin:20px 0;padding:22px 24px;background:radial-gradient(ellipse at 100% 0,#5025c727,transparent 60%),linear-gradient(120deg,#130c29,#0a0818);border:1px solid #6632a1;border-radius:17px;box-shadow:inset 0 1px #bd84ff0d}
body[data-account-design="neon"] .dailyBonus b{font-size:19px;font-weight:800;color:#f3eaff}
body[data-account-design="neon"] #dailyBonusText{font-size:13px;line-height:1.5;margin-top:4px;color:#bfb0d3}
body[data-account-design="neon"] .dailyDays{gap:9px;margin:18px 0 14px}
body[data-account-design="neon"] .dailyDay{padding:12px 5px;border-color:#46305e;background:#0b0919;border-radius:11px;font-size:12px;color:#cabfdb;min-width:0}
body[data-account-design="neon"] .dailyDay strong{font-size:19px;line-height:1.3;margin-top:5px}
body[data-account-design="neon"] .dailyDay.on{border-color:#b73dff;background:linear-gradient(145deg,#7624bd88,#351257);box-shadow:0 0 13px #a82eff40,inset 0 0 18px #8f32d929;color:#fff}
body[data-account-design="neon"] .dailyClaim{background:linear-gradient(130deg,#922be5,#5b18a8);border-color:#ae59e7;font-size:13px;border-radius:10px;padding:10px 18px}
body[data-account-design="neon"] .dailyClaim.claimed{background:#211934;border-color:#4f3b67;color:#baadcb;box-shadow:none}
body[data-account-design="neon"] .inventory-tools{gap:13px;border-block:0;padding:0;margin:21px 0 17px}
body[data-account-design="neon"] .inv-filter{border-radius:99px;background:#0d091c;border:1px solid #583781;padding:8px 13px;font-size:12px;font-weight:650;min-height:36px}
body[data-account-design="neon"] .inv-filter.active{background:linear-gradient(135deg,#a02dff,#6d17d0);border-color:#a452e8;box-shadow:0 0 13px #931eff44}
body[data-account-design="neon"] .inventory-search{min-height:37px;border-radius:10px;background:#090716;border-color:#4c365f;font-size:13px;padding:9px 12px}
body[data-account-design="neon"] .inventory-totals{gap:12px}
body[data-account-design="neon"] .inventory-value{border:1px solid #463159;background:#090716;border-radius:10px;padding:9px 12px;font-size:13px}
body[data-account-design="neon"] .inventory{gap:14px}
body[data-account-design="neon"] .item{border:1px solid #543182;border-radius:15px;background:linear-gradient(150deg,#140e2c,#0b081a 75%);box-shadow:inset 0 1px #bc8aff08;overflow:hidden;transition:border-color .2s,box-shadow .2s,transform .2s}
body[data-account-design="neon"] .item:hover{border-color:#aa4eeb;box-shadow:0 0 20px #931eff24;transform:translateY(-2px)}
body[data-account-design="neon"] .item-img{height:150px;background:radial-gradient(ellipse at 50% 65%,#7024ce20,transparent 70%);border-bottom:1px solid #49306966;padding:10px}
body[data-account-design="neon"] .item-body{padding:14px 13px 49px}
body[data-account-design="neon"] .item-name{font-family:inherit;font-size:14px;font-weight:750;line-height:1.45;overflow-wrap:anywhere;letter-spacing:-.2px;color:#f2edff}
body[data-account-design="neon"] .item-meta{font-size:11px;color:#a89abf;line-height:1.5}
body[data-account-design="neon"] .item .badge{border-radius:99px;font-size:10px;padding:5px 8px}
body[data-account-design="neon"] .actions button{border-radius:9px;min-height:31px;font-weight:700}
body[data-account-design="neon"] .d1psy-footer{background:#080611;border-color:#3c2455}
body[data-account-design="neon"] :is(a,button,input,[role=link]):focus-visible{outline:2px solid #ce8aff;outline-offset:3px}
#accountGiveawayHooks{display:none!important}
@media(max-width:1000px){body[data-account-design="neon"] .item{display:flex;flex-direction:column}body[data-account-design="neon"] .item-body{flex:1;padding-bottom:14px}body[data-account-design="neon"] .item-date{position:static;margin:0 12px 8px;font-size:10px}body[data-account-design="neon"] .item>.badge{position:static;align-self:flex-start;margin:0 12px 12px;max-width:calc(100% - 24px);white-space:normal;overflow-wrap:anywhere}}
@media(max-width:760px){body[data-account-design="neon"] .seasonAccountHero{padding:24px 21px;min-height:210px}body[data-account-design="neon"] .seasonAccountCopy{width:100%}body[data-account-design="neon"] .seasonAccountTitle{font-size:clamp(32px,8vw,52px)}body[data-account-design="neon"] .seasonAccountS1{font-size:160px;right:-10px;top:5px}body[data-account-design="neon"] .seasonAccountOpen{position:relative;right:auto;bottom:auto;display:inline-block;margin-top:17px;padding:12px 15px}body[data-account-design="neon"] .dailyBonus{padding:19px 17px}body[data-account-design="neon"] .dailyDays{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}body[data-account-design="neon"] .dailyClaim{width:auto}body[data-account-design="neon"] .card h2{font-size:24px}body[data-account-design="neon"] .levelWidget{padding:17px}body[data-account-design="neon"] .item-img{height:140px}body[data-account-design="neon"] .item-name{font-size:13px}}
@media(max-width:380px){body[data-account-design="neon"] .inventory{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}body[data-account-design="neon"] .item-img{height:110px}body[data-account-design="neon"] .item-body{padding:11px 10px 48px}body[data-account-design="neon"] .dailyDay strong{font-size:17px}}
@media(prefers-reduced-motion:reduce){body[data-account-design="neon"] .item{transition:none}body[data-account-design="neon"] .item:hover{transform:none}}
`;
