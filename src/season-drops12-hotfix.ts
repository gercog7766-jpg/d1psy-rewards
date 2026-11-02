import express from 'express';

export function installSeasonDrops12Hotfix(){
  const response:any=(express as any).response;
  const os=response.send;
  response.send=function(body:any){
    const req:any=(this as any).req;
    if(req?.path==='/api/me/season'&&typeof body==='string'){
      try{
        const data=JSON.parse(body);
        if(Array.isArray(data.weekly)){
          data.weekly=data.weekly.map((x:any)=>x?.key==='drops_10'?{...x,title:'Выиграй 12 дропов на стриме',target:12,progress:Math.min(12,Number(x.progress)||0)}:x);
        }
        body=JSON.stringify(data);
      }catch{}
    }
    if(req?.path==='/season'&&typeof body==='string'&&!body.includes('seasonDrops12Fix')){
      const js=`<script id="seasonDrops12Fix">(function(){function fix(){var cards=document.querySelectorAll('#weeklyTasks .task');cards.forEach(function(c){var s=c.querySelector('strong');if(!s)return;if(/дропа? на стриме/i.test(s.textContent||'')){s.textContent='Выиграй 12 дропов на стриме';var sub=c.querySelector('.sub');if(sub)sub.textContent=(sub.textContent||'').replace(/\/\s*2\b/,'/ 12');}})}new MutationObserver(fix).observe(document.documentElement,{subtree:true,childList:true});fix();})();</script>`;
      body=body.replace('</body>',js+'</body>');
    }
    return os.call(this,body);
  };
}
