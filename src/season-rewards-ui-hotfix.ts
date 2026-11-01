import express from 'express';

export function installSeasonRewardsUiHotfix(){
 const response:any=(express as any).response, original=response.send;
 response.send=function(body:any){
  const req:any=(this as any).req;
  if(req?.path==='/api/me/season'&&typeof body==='string'){
   try{
    const data=JSON.parse(body);
    if(Array.isArray(data.weekly)){
     data.weekly=data.weekly.filter((x:any)=>x.key!=='upgrade_value_3000').map((x:any)=>{
      if(x.key==='upgrades_15')return {...x,title:'Сделай 25 апгрейдов',target:25,progress:Math.min(25,Number(x.progress||0))};
      if(x.key==='withdraw_200')return {...x,title:'Выведи скин стоимостью 250+ монет',target:1};
      if(x.key==='upgrader_coins_200')return {...x,title:'Потрать суммарно 300+ монет в апгрейдере',target:300,progress:Math.min(300,Number(x.progress||0))};
      if(x.key==='drops_10')return {...x,title:'Выиграй 2 дропа на стриме',target:2,progress:Math.min(2,Number(x.progress||0))};
      if(x.key==='upgrade_x3')return {...x,title:'Сделай успешный апгрейд ×2 или выше два раза подряд',target:2,progress:Math.min(2,Number(x.progress||0))};
      return x;
     });
    }
    body=JSON.stringify(data);
   }catch{}
  }
  if(req?.path==='/season'&&typeof body==='string'&&!body.includes('seasonRewardsClaimUi')){
   const css=`<style id="seasonRewardsClaimUi">.bpRewardCard.claimable{cursor:pointer;border-color:#c084fc;box-shadow:0 0 0 1px #a855f7,0 0 28px #a855f744}.bpRewardCard.claimed{opacity:.72}.bpClaim{position:absolute;left:7px;right:7px;bottom:7px;border:0;border-radius:7px;padding:6px 3px;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;font-size:9px;font-weight:950;cursor:pointer}.bpClaim:disabled{opacity:.55;cursor:default}.bpRewardGift.hasClaim{height:57px}</style>`;
   const js=`<script id="seasonRewardsClaimUiJs">(function(){var amounts=function(l){return l<=2?5:l<=4?7:l<=10?10:l<=15?15:l<=20?20:(l>=25&&l<=30)?30:(l>=31&&l<=40)?50:(l>=41&&l<=49)?80:0};async function refresh(){try{var r=await fetch('/api/me/season',{cache:'no-store'});if(!r.ok)return;var s=await r.json(),claimed=new Set((s.claimedLevels||s.claimed_levels||[]).map(Number));document.querySelectorAll('.bpRewardCard').forEach(function(card){var lv=Number((card.querySelector('.bpRewardLv')?.textContent||'').replace(/[^0-9]/g,'')),amt=amounts(lv);if(!lv||!amt||lv>Number(s.level))return;if(claimed.has(lv)){card.classList.add('claimed');var old=card.querySelector('.bpClaim');if(old)old.remove();return}card.classList.add('claimable');var gift=card.querySelector('.bpRewardGift');if(gift)gift.classList.add('hasClaim');if(!card.querySelector('.bpClaim')){var b=document.createElement('button');b.className='bpClaim';b.textContent='ЗАБРАТЬ';b.onclick=async function(e){e.stopPropagation();b.disabled=true;b.textContent='...';try{var q=await fetch('/api/me/season/rewards/'+lv+'/claim',{method:'POST'}),j=await q.json().catch(function(){return{}});if(!q.ok||!j.ok){b.disabled=false;b.textContent=j.error==='already_claimed'?'ПОЛУЧЕНО':'ПОВТОРИТЬ';if(j.error==='already_claimed'){card.classList.add('claimed');setTimeout(function(){b.remove()},500)}return}claimed.add(lv);card.classList.remove('claimable');card.classList.add('claimed');b.textContent='ПОЛУЧЕНО';setTimeout(function(){b.remove()},650)}catch{b.disabled=false;b.textContent='ПОВТОРИТЬ'}};card.appendChild(b)}})}catch{}}setTimeout(refresh,1000);setTimeout(refresh,1800)})();</script>`;
   body=body.replace('</head>',css+'</head>').replace('</body>',js+'</body>');
  }
  return original.call(this,body);
 };
}
