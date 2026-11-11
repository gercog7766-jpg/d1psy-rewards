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
      <a href="/black-box" class="seasonAccountHero" style="min-height:unset;box-sizing:border-box;text-decoration:none">
        <strong>ЧЁРНЫЙ ЯЩИК</strong> <span style="float:right">К торгам →</span>
      </a>`;
      const css=`<style>
      .seasonAccountHero{position:relative;display:block;overflow:hidden;width:100%;min-height:178px;margin:0 0 14px;padding:24px 26px 22px;border:1px solid #7443a1;border-radius:14px;background:linear-gradient(115deg,#241035 0%,#160b22 48%,#2a0d2a 100%);box-shadow:0 12px 34px #0008,inset 0 1px #ffffff0d;cursor:pointer;color:#fff;isolation:isolate;transition:.18s transform,.18s border-color,.18s box-shadow}.seasonAccountHero:hover{transform:translateY(-1px);border-color:#a855f7;box-shadow:0 15px 42px #7c3aed2e}.seasonAccountGlow{position:absolute;width:360px;height:260px;left:-80px;top:-150px;background:#8b5cf655;filter:blur(70px);z-index:-1}.seasonAccountCopy{position:relative;z-index:2;width:calc(100% - 210px);max-width:620px}.seasonAccountEyebrow{font-size:11px;font-weight:1000;letter-spacing:.19em;color:#d8b4fe}.seasonAccountTitle{font-size:clamp(29px,4vw,50px);line-height:.95;font-weight:1000;letter-spacing:.025em;margin:7px 0 14px}.seasonAccountMeta{display:flex;align-items:center;flex-wrap:wrap;gap:6px 13px;min-height:18px;padding-right:4px;font-size:11px;line-height:1.35;color:#cbb8db}.seasonAccountMeta b{color:#fff;white-space:nowrap}.seasonAccountProgress{width:min(480px,100%);height:5px;margin-top:13px;border-radius:99px;background:#09050e;overflow:hidden}.seasonAccountProgress i{display:block;width:0;height:100%;background:linear-gradient(90deg,#7c3aed,#d946ef);box-shadow:0 0 12px #c026d3}.seasonAccountS1{position:absolute;right:3%;top:-39px;font-size:150px;line-height:1;font-weight:1000;color:#ffffff0b;transform:rotate(-8deg);z-index:0;pointer-events:none}.seasonAccountOpen{position:absolute;right:24px;bottom:22px;z-index:3;padding:10px 13px;border:1px solid #8b5cf6;border-radius:9px;background:#7c3aed33;font-size:10px;line-height:1;font-weight:1000;letter-spacing:.05em;white-space:nowrap}.seasonFloat{display:none!important}@media(max-width:760px){.seasonAccountHero{min-height:190px;padding:21px}.seasonAccountCopy{width:100%;max-width:100%;padding-right:0}.seasonAccountS1{font-size:110px;right:-5%;top:-18px}.seasonAccountOpen{position:relative;right:auto;bottom:auto;display:inline-block;margin-top:15px}.seasonAccountMeta{padding-right:0}}@media(max-width:420px){.seasonAccountHero{min-height:205px}.seasonAccountTitle{font-size:34px}.seasonAccountMeta{display:block}.seasonAccountMeta b{display:block;margin-top:4px}}
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
