import express from 'express';

const START=Date.parse('2026-11-01T21:00:00.000Z');
const END=Date.parse('2026-12-12T21:00:00.000Z');

export function installSeasonAccountBannerHotfix(){
  const response:any=(express as any).response;
  const os=response.send;
  response.send=function(body:any){
    const req:any=(this as any).req;
    if(typeof body==='string'&&req?.path==='/account'&&!body.includes('seasonAccountHero')){
      const banner=`<section id="seasonAccountHero" class="seasonAccountHero" onclick="location.href='/season'" role="link" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();location.href='/season'}">
        <div class="seasonAccountGlow"></div>
        <div class="seasonAccountCopy">
          <div class="seasonAccountEyebrow">D1PSY SEASON 1</div>
          <div class="seasonAccountTitle">NIGHT SHIFT</div>
          <div class="seasonAccountMeta"><span id="seasonAccountState">Старт 02.11.2026 · 00:00 МСК</span><b id="seasonAccountTimer">—</b></div>
          <div class="seasonAccountProgress"><i></i></div>
        </div>
        <div class="seasonAccountS1">S1</div>
        <div class="seasonAccountOpen">ОТКРЫТЬ BATTLE PASS →</div>
      </section>
      <a href="/black-box" class="blackBoxBanner">
        <span class="blackBoxBannerCopy"><strong>Чёрный ящик</strong><span class="seasonAccountOpen">К ТОРГАМ →</span></span>
        <span class="blackBoxBannerArt" aria-hidden="true">
          <img class="blackBoxBannerKnife" src="https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Q7uCvZaZkNM-bF1iWzvxzo_VWTSahkBwrjDGMnYftbyifZgQlA8EhRrRfuhm7lIa2MerjtlaKi4NGnius3SMc6Slv574AUPA7uvqA0RoB8ZE" alt="" decoding="async">
          <img class="blackBoxBannerCase" src="/black-box/case.jpg" alt="" decoding="async">
        </span>
      </a>
      <a id="savingsBanner" href="/savings" class="savingsBanner">
        <span class="savingsBannerCopy"><strong>Накопления</strong><span class="seasonAccountOpen">ОТКРЫТЬ →</span></span>
        <span class="coinRain" aria-hidden="true"><i><img src="/pwa/icon/brand-logo.png" alt=""></i><i><img src="/pwa/icon/brand-logo.png" alt=""></i><i><img src="/pwa/icon/brand-logo.png" alt=""></i><i><img src="/pwa/icon/brand-logo.png" alt=""></i><i><img src="/pwa/icon/brand-logo.png" alt=""></i><i><img src="/pwa/icon/brand-logo.png" alt=""></i><i><img src="/pwa/icon/brand-logo.png" alt=""></i><i><img src="/pwa/icon/brand-logo.png" alt=""></i></span>
        <span class="savingsBannerArt" aria-hidden="true"><img src="/savings/assets/pig.webp" alt="" decoding="async"></span>
      </a>`;
      const css=`<style>
      .seasonAccountHero{position:relative;display:block;overflow:hidden;width:100%;min-height:178px;margin:0 0 14px;padding:24px 26px 22px;border:1px solid #7443a1;border-radius:14px;background:linear-gradient(115deg,#241035 0%,#160b22 48%,#2a0d2a 100%);box-shadow:0 12px 34px #0008,inset 0 1px #ffffff0d;cursor:pointer;color:#fff;isolation:isolate;transition:.18s transform,.18s border-color,.18s box-shadow}.seasonAccountHero:hover{transform:translateY(-1px);border-color:#a855f7;box-shadow:0 15px 42px #7c3aed2e}.seasonAccountGlow{position:absolute;width:360px;height:260px;left:-80px;top:-150px;background:#8b5cf655;filter:blur(70px);z-index:-1}.seasonAccountCopy{position:relative;z-index:2;width:calc(100% - 210px);max-width:620px}.seasonAccountEyebrow{font-size:11px;font-weight:1000;letter-spacing:.19em;color:#d8b4fe}.seasonAccountTitle{font-size:clamp(29px,4vw,50px);line-height:.95;font-weight:1000;letter-spacing:.025em;margin:7px 0 14px}.seasonAccountMeta{display:flex;align-items:center;flex-wrap:wrap;gap:6px 13px;min-height:18px;padding-right:4px;font-size:11px;line-height:1.35;color:#cbb8db}.seasonAccountMeta b{color:#fff;white-space:nowrap}.seasonAccountProgress{width:min(480px,100%);height:5px;margin-top:13px;border-radius:99px;background:#09050e;overflow:hidden}.seasonAccountProgress i{display:block;width:0;height:100%;background:linear-gradient(90deg,#7c3aed,#d946ef);box-shadow:0 0 12px #c026d3}.seasonAccountS1{position:absolute;right:3%;top:-39px;font-size:150px;line-height:1;font-weight:1000;color:#ffffff0b;transform:rotate(-8deg);z-index:0;pointer-events:none}.seasonAccountOpen{position:absolute;right:24px;bottom:22px;z-index:3;padding:10px 13px;border:1px solid #8b5cf6;border-radius:9px;background:#7c3aed33;font-size:10px;line-height:1;font-weight:1000;letter-spacing:.05em;white-space:nowrap}.seasonFloat{display:none!important}@media(max-width:760px){.seasonAccountHero{min-height:190px;padding:21px}.seasonAccountCopy{width:100%;max-width:100%;padding-right:0}.seasonAccountS1{font-size:110px;right:-5%;top:-18px}.seasonAccountOpen{position:relative;right:auto;bottom:auto;display:inline-block;margin-top:15px}.seasonAccountMeta{padding-right:0}}@media(max-width:420px){.seasonAccountHero{min-height:205px}.seasonAccountTitle{font-size:34px}.seasonAccountMeta{display:block}.seasonAccountMeta b{display:block;margin-top:4px}}

      .blackBoxBanner{position:relative;isolation:isolate;display:flex;align-items:center;box-sizing:border-box;min-height:92px;margin:0 0 14px;padding:14px 22px;overflow:hidden;border:1px solid #68438b;border-radius:14px;background:radial-gradient(ellipse at 82% 90%,#482467 0%,transparent 60%),#181024;color:#fff;text-decoration:none}
      .blackBoxBanner:hover{border-color:#a668d6}.blackBoxBanner:focus-visible{outline:2px solid #ce8aff;outline-offset:3px}
      .blackBoxBannerCopy{z-index:1;display:grid;gap:4px}.blackBoxBannerCopy strong{font-size:clamp(18px,3vw,26px);line-height:1.12}.blackBoxBanner .blackBoxBannerCopy .seasonAccountOpen{position:static;justify-self:start;margin:3px 0 0;color:#fff}
      .blackBoxBannerArt{position:absolute;inset:0 10px 0 auto;width:min(51%,360px);pointer-events:none}
      .blackBoxBannerArt img{position:absolute;object-fit:contain;max-width:none}
      .blackBoxBannerKnife{width:58%;height:112%;left:0;top:-8%;opacity:.46;transform:rotate(-14deg);filter:saturate(.6)}
      .blackBoxBannerCase{width:64%;height:auto;right:-1%;top:50%;transform:translateY(-50%);filter:brightness(.85);clip-path:polygon(9.5% 32%,13% 24%,16% 15.5%,18% 13.2%,21% 13.2%,22% 12.1%,24.5% 12.1%,25% 13.3%,31.5% 13.3%,32.3% 12.1%,37.5% 12.1%,38.2% 13.3%,61% 13.3%,62% 12.1%,67% 12.1%,68% 13.3%,74.5% 13.3%,75.4% 12.1%,78.4% 12.1%,79.4% 13.3%,82.4% 13.3%,84.2% 14.8%,86.5% 20%,86.7% 24%,88.6% 26.5%,90.5% 32%,90.4% 42%,89.3% 50%,88.3% 52%,87.6% 75%,87.8% 79%,87.2% 84%,83.7% 88.6%,16.5% 88.6%,13% 85.4%,12.3% 82.9%,12.2% 75.4%,11.5% 53%,10.6% 50%,10.5% 43.5%,9.6% 42%)}
      .savingsBanner{position:relative;isolation:isolate;display:flex;align-items:center;box-sizing:border-box;min-height:92px;margin:0 0 14px;padding:13px 22px;overflow:hidden;border:1px solid #68438b;border-radius:14px;background:radial-gradient(ellipse at 82% 90%,#482467 0%,transparent 60%),linear-gradient(110deg,#1c1028,#15101f 62%,#22122f);color:#fff;text-decoration:none;box-shadow:inset 0 1px #ffffff0a}
      .savingsBanner:hover{border-color:#a668d6}.savingsBanner:focus-visible{outline:2px solid #ce8aff;outline-offset:3px}.savingsBannerCopy{position:relative;z-index:2;display:grid;gap:3px}.savingsBannerCopy strong{font-size:clamp(18px,3vw,26px);line-height:1.12}.savingsBanner .savingsBannerCopy .seasonAccountOpen{position:static;justify-self:start;margin:3px 0 0;color:#fff}
      .savingsBannerArt{position:absolute;z-index:1;right:16%;top:50%;width:100px;height:90px;transform:translateY(-50%);opacity:.62;filter:drop-shadow(0 4px 12px #0009)}.savingsBannerArt img{width:100%;height:100%;object-fit:contain;filter:brightness(.88) sepia(.2) saturate(1.4)}
      .coinRain{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}.coinRain i{position:absolute;top:-35px;left:var(--x);display:grid;place-items:center;width:21px;height:21px;border:1px solid #d8a8ff99;border-radius:50%;background:radial-gradient(circle at 35% 30%,#d962ff,#7822b8 60%,#42116d);color:#fbeaff;font:900 11px/1 Arial,sans-serif;font-style:normal;text-shadow:0 1px 4px #4a0c69;box-shadow:inset 0 0 0 2px #edc6ff33,0 0 12px #a644dd44;animation:coin-fall var(--duration) linear var(--delay) infinite}
      .coinRain i img{width:13px;height:13px;object-fit:contain;filter:drop-shadow(0 0 4px #fff8)}.coinRain i:nth-child(1){--x:18%;--duration:7.8s;--delay:-4.1s}.coinRain i:nth-child(2){--x:31%;--duration:9.2s;--delay:-7s}.coinRain i:nth-child(3){--x:44%;--duration:8.5s;--delay:-1.7s}.coinRain i:nth-child(4){--x:57%;--duration:7.2s;--delay:-5.8s}.coinRain i:nth-child(5){--x:70%;--duration:9.6s;--delay:-3.3s}.coinRain i:nth-child(6){--x:83%;--duration:8.1s;--delay:-6.4s}.coinRain i:nth-child(7){--x:94%;--duration:10s;--delay:-2.2s}.coinRain i:nth-child(8){--x:5%;--duration:9s;--delay:-8s}@keyframes coin-fall{0%{transform:translateY(-10px) rotate(0);opacity:0}10%{opacity:.65}85%{opacity:.42}100%{transform:translateY(150px) rotate(220deg);opacity:0}}
      @media(prefers-reduced-motion:reduce){.coinRain i{animation:none;opacity:.3;top:35%}}
      @media(max-width:520px){.blackBoxBanner{padding-inline:16px}.blackBoxBannerArt{width:47%;right:3px}.blackBoxBannerCase{width:82%}.blackBoxBannerKnife{width:64%;left:-9%;opacity:.34}.savingsBanner{padding-inline:16px}.savingsBannerArt{right:9%;width:80px;height:76px}.savingsBannerCopy{max-width:62%}.savingsBanner .seasonAccountOpen{font-size:9px;padding:8px 10px}}
      </style>`;
      const js=`<script>(function(){var s=${START},e=${END};function t(){var n=Date.now(),el=document.getElementById('seasonAccountTimer'),st=document.getElementById('seasonAccountState');if(!el||!st)return;var fill=document.querySelector('.seasonAccountProgress i');if(fill)fill.style.width=Math.max(0,Math.min(100,(n-s)/(e-s)*100))+'%';var d;if(n<s){d=s-n;st.textContent='Старт 02.11.2026 · 00:00 МСК';el.textContent='через '+Math.floor(d/86400000)+'д '+Math.floor(d%86400000/3600000)+'ч'}else if(n>=e){st.textContent='SEASON 1 завершён';el.textContent=''}else{d=e-n;st.textContent='Сезон активен';el.textContent='до конца '+Math.floor(d/86400000)+'д '+Math.floor(d%86400000/3600000)+'ч'}}t();setInterval(t,60000)})();</script>`;
      // Insert BEFORE the complete current-drop card, not inside it.
      const markerRe=/(ТЕКУЩИЙ РОЗЫГРЫШ|Текущий розыгрыш)/i;
      const mm=markerRe.exec(body);
      if(mm){
        const pos=mm.index;
        // Find the nearest opening tag before the heading, then walk outward to the
        // containing bordered card by preferring a section/article, or a div whose
        // opening tag carries card/panel/block-like styling/classes.
        let start=-1;
        const prefix=body.slice(0,pos);
        const candidates=[...prefix.matchAll(/<(section|article|div)\b[^>]*>/gi)];
        for(let i=candidates.length-1;i>=0;i--){
          const m=candidates[i]; const tag=m[0];
          if(/^<(section|article)\b/i.test(tag)||/(card|panel|block|drop|giveaway|border|rounded)/i.test(tag)){start=m.index??-1;break}
        }
        if(start<0){const m=[...prefix.matchAll(/<div\b[^>]*>/gi)].pop();start=m?.index??-1}
        if(start>=0) body=body.slice(0,start)+banner+body.slice(start);
        else body=body.replace(/<body([^>]*)>/i,'<body$1>'+banner);
      }else body=body.replace(/<body([^>]*)>/i,'<body$1>'+banner);
      body=body.replace('</head>',css+'</head>').replace('</body>',js+'</body>');
    }
    return os.call(this,body)
  };
}
