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
    if(req?.path==='/season'&&typeof body==='string'&&!body.includes('seasonDrops12FixV2')){
      const js=`<script id="seasonDrops12FixV2">(function(){
        function isDropCard(c){var s=c&&c.querySelector&&c.querySelector('strong');return !!(s&&/дроп(?:а|ов)? на стриме/i.test(s.textContent||''));}
        function fix(){
          var cards=document.querySelectorAll('#weeklyTasks .task');
          cards.forEach(function(c){
            if(!isDropCard(c))return;
            var s=c.querySelector('strong'),sub=c.querySelector('.sub'),bar=c.querySelector('.taskProgress i');
            if(s)s.textContent='Выиграй 12 дропов на стриме';
            if(sub){var m=(sub.textContent||'').match(/Прогресс:\\s*(\\d+)/i),p=m?Math.min(12,Number(m[1])||0):0;sub.textContent='Прогресс: '+p+' / 12';if(bar)bar.style.width=Math.min(100,p/12*100)+'%';}
          });
        }
        var root=document.getElementById('weeklyTasks');
        if(root)new MutationObserver(function(){fix()}).observe(root,{subtree:true,childList:true,characterData:true});
        fix();setTimeout(fix,0);setTimeout(fix,250);setTimeout(fix,1200);
      })();</script>`;
      body=body.replace('</body>',js+'</body>');
    }
    return os.call(this,body);
  };
}
