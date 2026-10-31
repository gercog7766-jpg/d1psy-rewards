import express from 'express';

export function installAccountUiRefreshHotfix(){
  const proto:any=(express as any).application;
  const originalGet=proto.get;
  proto.get=function(path:any,...handlers:any[]){
    if(path==='/account'){
      handlers=handlers.map((handler:any)=>async function(req:any,res:any,next:any){
        const originalSend=res.send.bind(res);
        res.send=(body:any)=>{
          if(typeof body==='string'&&body.includes('d1psy Rewards')){
            body=body.replace('<h1 class="title">Твой инвентарь</h1>','');
            body=body.replace('<h2>Выигранные предметы</h2>','<h2>Инвентарь</h2>');
            body=body.replace("liveProgress.textContent=Math.floor(left/60)+':'+String(left%60).padStart(2,'0')+' · '+(g.participant_count||0)+' участ.'","liveProgress.textContent=Math.floor(left/60)+':'+String(left%60).padStart(2,'0')");
            body=body.replace('</style>','\n/* account UI refresh */\nmain{padding-top:26px}.top{align-items:center;margin-bottom:14px;padding:0 2px}.eyebrow{font-size:13px}.user{font-size:14px}.economybar{margin-top:7px}.coinbox,.shoplink{padding:8px 12px}.live{margin-top:0;padding:16px 18px;border-radius:16px;box-shadow:none}.live-main{font-size:17px}.card:not(.live){margin-top:14px}.card h2{font-size:24px}.muted{font-size:14px}.inventory{margin-top:16px}@media(max-width:620px){main{padding-top:20px}.top{flex-direction:row;align-items:center}.user{text-align:right}.economybar{justify-content:flex-end}.live{flex-direction:row;align-items:center}.live-side{text-align:right}}\n</style>');
          }
          return originalSend(body);
        };
        return handler(req,res,next);
      });
    }
    return originalGet.call(this,path,...handlers);
  };
}
