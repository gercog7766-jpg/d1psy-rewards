export const bossAccountBannerScript=String.raw`(()=>{
 const root=document.getElementById('bossAccountHero');if(!root)return;
 const status=root.querySelector('#bossAccountStatus'),health=root.querySelector('#bossAccountHealth'),fill=health.querySelector('i'),hp=root.querySelector('#bossAccountHp'),image=root.querySelector('#bossAccountImage');
 const bosses={dropsy:{name:'DROPSY',image:'/live-boss/756.webp'},guardian:{name:'VOID GUARDIAN',image:'/live-boss/757.webp'},titan:{name:'ABYSS TITAN',image:'/live-boss/758.webp'}};
 let pending=false;
 const number=n=>n.toLocaleString('ru-RU');
 function idle(message='Следующий рейд скоро начнётся'){root.dataset.state='idle';status.textContent=message;health.hidden=true;hp.textContent='';image.src=bosses.guardian.image;}
 async function refresh(){if(pending)return;pending=true;try{
  const response=await fetch('/api/public/boss',{cache:'no-store'});if(!response.ok)throw Error();const {boss}=await response.json();
  if(!boss||boss.hidden){idle();return}const info=bosses[boss.kind];if(!info||!Number.isFinite(boss.hp)||!Number.isFinite(boss.max_hp)||boss.max_hp<=0||boss.hp<0||boss.hp>boss.max_hp||!['active','paused','review','paid'].includes(boss.status))throw Error();
  root.dataset.state=boss.status;status.textContent=info.name+' · '+({active:'Бой идёт',paused:'Пауза',review:'Победа',paid:'Победа'}[boss.status]);
  image.src=info.image;health.hidden=false;fill.style.width=(100*boss.hp/boss.max_hp)+'%';hp.textContent=number(boss.hp)+' / '+number(boss.max_hp)+' HP';health.setAttribute('aria-valuemax',String(boss.max_hp));health.setAttribute('aria-valuenow',String(boss.hp));
 }catch{idle('Открой арену, чтобы проверить состояние боя')}finally{pending=false}}
 void refresh();setInterval(()=>{if(!document.hidden)void refresh()},30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh()});
})();`;

export const bossAccountBanner=`<a id="bossAccountHero" class="seasonAccountHero bossAccountHero" href="/bosses" aria-label="Открыть арену боссов Dropso"><style>
body #bossAccountHero{display:flex;align-items:center;justify-content:flex-start;position:relative;isolation:isolate;min-height:190px;padding:24px 26px;text-decoration:none;color:#fff;background:radial-gradient(ellipse at 84% 52%,#8238d47a 0%,#4820734d 35%,transparent 66%),linear-gradient(110deg,#331447,#160b28 58%,#291148);border-color:#a75de1;overflow:hidden}
#bossAccountHero:focus-visible{outline:2px solid #e6baff;outline-offset:3px}
#bossAccountHero .bossAccountCopy{position:relative;z-index:2;min-width:0;width:min(65%,560px)}
#bossAccountHero .seasonAccountTitle{font-size:clamp(27px,5.7cqw,56px);line-height:1.05;margin:7px 0 10px;letter-spacing:-.025em}#bossAccountHero .seasonAccountTitle span{color:#d892ff}
#bossAccountHero .bossAccountStatus{display:flex;align-items:center;gap:7px;color:#ead9f7;font-size:13px;font-weight:700;line-height:1.45;overflow-wrap:anywhere}#bossAccountHero .bossAccountStatus::before{content:"";flex:none;width:8px;height:8px;background:#aa86d1;border-radius:50%}#bossAccountHero[data-state="active"] .bossAccountStatus::before{background:#62efa5;box-shadow:0 0 12px #62efa5}
#bossAccountHero .bossAccountHealth{width:min(100%,320px);height:7px;overflow:hidden;background:#10071e;border-radius:99px;margin-top:9px;border:1px solid #a260dc80}#bossAccountHero .bossAccountHealth[hidden]{display:none}#bossAccountHero .bossAccountHealth i{display:block;height:100%;background:linear-gradient(90deg,#9339ed,#f44a9d);transition:width .4s;width:0}#bossAccountHero .bossAccountHp{font-size:11px;font-weight:700;color:#ecd5ff;margin-top:3px;min-height:0}
#bossAccountHero .bossAccountAction{display:inline-flex;align-items:center;justify-content:center;margin-top:11px;padding:9px 12px;border-radius:8px;border:1px solid #b877ee;background:#7736b559;color:#fff;font-size:11px;font-weight:800}
#bossAccountHero .bossAccountArt{position:absolute;inset:0 0 0 auto;width:42%;z-index:0;pointer-events:none;background:radial-gradient(ellipse at 58% 55%,#d0a2ff4d,transparent 66%)}#bossAccountHero .bossAccountArt img{position:absolute;right:8%;top:1%;width:84%;height:98%;object-fit:contain;filter:drop-shadow(0 0 14px #b96effa1)}
@media(max-width:760px){body #bossAccountHero{min-height:170px;padding:16px 14px;flex-direction:row;align-items:center}#bossAccountHero .bossAccountCopy{width:65%}#bossAccountHero .seasonAccountTitle{font-size:clamp(24px,7cqw,36px)}#bossAccountHero .bossAccountStatus{font-size:11px}#bossAccountHero .bossAccountArt{width:42%}#bossAccountHero .bossAccountArt img{width:98%;right:0}}
@media(prefers-reduced-motion:reduce){#bossAccountHero .bossAccountHealth i{transition:none}}
</style><div class="bossAccountCopy"><div class="seasonAccountEyebrow">СОВМЕСТНЫЙ РЕЙД</div><div class="seasonAccountTitle">DROPSO <span>LIVE BOSS</span></div><div id="bossAccountStatus" class="bossAccountStatus">Проверяем состояние боя…</div><div id="bossAccountHealth" class="bossAccountHealth" role="progressbar" aria-label="Здоровье босса" aria-valuemin="0" hidden><i></i></div><div id="bossAccountHp" class="bossAccountHp"></div><span class="bossAccountAction">ПЕРЕЙТИ К БОССУ</span></div><div class="bossAccountArt" aria-hidden="true"><img id="bossAccountImage" src="/live-boss/757.webp" width="380" height="340" alt="" decoding="async"></div></a><script id="bossAccountBannerScript">${bossAccountBannerScript}</script>`;
