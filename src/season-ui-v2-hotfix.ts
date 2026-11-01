import express from 'express';

const NON_STREAM_DAILY=[
  {key:'daily_bonus',title:'Забери бонус дня',target:1,reward:100},
  {key:'upgrades_2',title:'Сделай 2 апгрейда',target:2,reward:150},
  {key:'shop_buy',title:'Купи предмет в магазине',target:1,reward:150},
  {key:'xp_100',title:'Получи 100 XP за день',target:100,reward:150},
  {key:'withdraw_30',title:'Выведи скин стоимостью 30+ монет',target:1,reward:150},
  {key:'upgrade_win',title:'Сделай успешный апгрейд',target:1,reward:200}
];
function moscowParts(now=Date.now()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(new Date(now));
  const get=(t:string)=>parts.find(x=>x.type===t)?.value||'';
  return {key:`${get('year')}-${get('month')}-${get('day')}`,weekday:get('weekday')};
}
function sundayDaily(key:string){let h=0;for(const c of key)h=(h*31+c.charCodeAt(0))>>>0;const a=[...NON_STREAM_DAILY];for(let i=a.length-1;i>0;i--){h=(h*1664525+1013904223)>>>0;const j=h%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a.slice(0,3).map(x=>({...x,progress:0,done:false}));}
export function installSeasonUiV2Hotfix(){
  const response:any=(express as any).response;
  const os=response.send;
  response.send=function(body:any){
    const req:any=(this as any).req;
    if(req?.path==='/api/me/season'&&typeof body==='string'){
      try{
        const data=JSON.parse(body); const m=moscowParts();
        if(m.weekday==='Sun'&&Array.isArray(data.daily)&&data.daily.some((x:any)=>x.key==='drop_win')) data.daily=sundayDaily(m.key);
        body=JSON.stringify(data);
      }catch{}
    }
    if(req?.path==='/season'&&typeof body==='string'&&!body.includes('seasonUiV2')){
      const css=`<style id="seasonUiV2">
      #rewards #track{display:flex!important;flex-direction:column!important;gap:18px!important}
      .bpRewardRow{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));align-items:center;gap:0;padding:12px 4px 18px;overflow-x:auto}
      .bpRewardCell{display:flex;align-items:center;min-width:118px}
      .bpRewardCell:not(:last-child):after{content:'';height:1px;min-width:14px;flex:1;background:linear-gradient(90deg,#5d426f,#30223a);opacity:.8}
      .bpRewardCard{width:104px;min-width:104px;height:126px;border:1px solid #3b2a47;border-radius:15px;background:linear-gradient(155deg,#17111d,#0e0a12);padding:12px;position:relative;overflow:hidden;transition:.18s}
      .bpRewardCard.locked{filter:brightness(.38) saturate(.45);opacity:.78}.bpRewardCard.unlocked{border-color:#8050a7;box-shadow:0 0 20px #7c3aed20}.bpRewardCard.current{border-color:#c084fc;box-shadow:0 0 0 1px #a855f7,0 0 26px #7c3aed45}
      .bpRewardLv{font-size:10px;color:#ad9aba;font-weight:900;letter-spacing:.05em}.bpRewardGift{display:flex;align-items:center;justify-content:center;height:72px;text-align:center;font-size:12px;line-height:1.25;font-weight:950}.bpRewardLock{position:absolute;right:9px;top:8px;font-size:12px;opacity:.8}.bpRewardRange{font-size:12px;color:#a995b8;font-weight:900;letter-spacing:.08em;margin:0 0 -7px 5px}
      #daily .sectionTitle{display:flex;align-items:center;justify-content:space-between;gap:12px}.dailyReset{font-size:12px;color:#bda9ca;font-weight:700}.dailyReset b{color:#e9d5ff;font-variant-numeric:tabular-nums}.task.done{border-color:#6d4b83;background:#1b1222}.taskProgress{height:5px;border-radius:99px;background:#09060d;overflow:hidden;margin:12px 0 7px}.taskProgress i{display:block;height:100%;background:linear-gradient(90deg,#7c3aed,#d946ef)}
      @media(max-width:900px){.bpRewardRow{grid-template-columns:repeat(10,118px)}}
      </style>`;
      const js=`<script id="seasonUiV2Js">(function(){
      function esc(s){return String(s||'').replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}
      function rewardRows(s){var root=document.getElementById('track');if(!root||!s||!Array.isArray(s.rewards))return;var html='';for(var start=1;start<=50;start+=10){html+='<div><div class="bpRewardRange">BP '+start+'–'+(start+9)+'</div><div class="bpRewardRow">';for(var l=start;l<start+10;l++){var x=s.rewards.find(function(r){return r.level===l});if(!x)continue;html+='<div class="bpRewardCell"><div class="bpRewardCard '+(x.unlocked?'unlocked':'locked')+' '+(x.level===s.level?'current':'')+'"><div class="bpRewardLv">LVL '+x.level+'</div><div class="bpRewardGift">'+(x.unlocked?esc(x.label):'???')+'</div>'+(!x.unlocked?'<div class="bpRewardLock">🔒</div>':'')+'</div></div>'}html+='</div></div>'}root.innerHTML=html}
      function dailyCards(s){var root=document.getElementById('dailyTasks');if(!root||!s||!Array.isArray(s.daily))return;root.innerHTML=s.daily.map(function(x){var p=Math.min(100,(Number(x.progress)||0)/(Number(x.target)||1)*100);return '<div class="task '+(x.done?'done':'')+'"><strong>'+esc(x.title)+'</strong><div class="sub">Прогресс: '+x.progress+' / '+x.target+'</div><div class="taskProgress"><i style="width:'+p+'%"></i></div><div class="sp">'+(x.done?'✓ Выполнено · ':'')+'+'+x.reward+' SP</div></div>'}).join('')}
      function nextMsk(){var now=new Date(),parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(now).split('-').map(Number);return Date.UTC(parts[0],parts[1]-1,parts[2]+1)-3*3600000}
      var resetAt=nextMsk(),lastDay='';function clock(){var el=document.getElementById('dailyResetClock');if(!el)return;var d=Math.max(0,resetAt-Date.now()),h=Math.floor(d/3600000),m=Math.floor(d%3600000/60000),sec=Math.floor(d%60000/1000);el.textContent=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');if(d<=0){resetAt=nextMsk();location.reload()}}
      function enhance(){if(!window.state)return;rewardRows(window.state);dailyCards(window.state);var h=document.querySelector('#daily .sectionTitle');if(h&&!document.getElementById('dailyResetClock'))h.innerHTML='Ежедневные задания <span class="dailyReset">Обновление в 00:00 МСК · <b id="dailyResetClock">--:--:--</b></span>';clock()}
      var timer=setInterval(enhance,300);setTimeout(function(){clearInterval(timer)},10000);setInterval(clock,1000);
      })();</script>`;
      body=body.replace('</head>',css+'</head>').replace('</body>',js+'</body>');
    }
    return os.call(this,body);
  };
}
