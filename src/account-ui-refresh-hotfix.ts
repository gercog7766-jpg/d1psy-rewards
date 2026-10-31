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
            body=body.replace('<div class="top"><div><div class="eyebrow">d1psy Rewards</div></div><div><div id="who" class="user">Загрузка…</div><div class="economybar">','<div class="top"><a class="brand" href="/account"><span class="brand-mark">D1</span><span>D1PSY REWARDS</span></a><div class="top-right"><div id="who" class="user">Загрузка…</div><div class="economybar">');
            body=body.replace('</a></div></div></div><section class="card live">','</a></div></div></div></div><section class="card live">');
            body=body.replace('</style>','\n/* compact account navigation */\nmain{padding-top:20px}.top{align-items:center;margin-bottom:14px;padding:0 2px}.top-right{display:flex;align-items:center;gap:14px}.brand{display:flex;align-items:center;gap:10px;color:#f5f3ff;text-decoration:none;font-size:13px;font-weight:900;letter-spacing:.12em}.brand-mark{display:grid;place-items:center;width:34px;height:34px;border:1px solid #55317b;border-radius:10px;background:linear-gradient(145deg,#291443,#171020);color:#c4b5fd;font-size:12px;letter-spacing:0;box-shadow:0 8px 24px rgba(0,0,0,.18)}.eyebrow{display:none}.user{font-size:13px;color:#b9a7d6;text-align:right}.economybar{margin-top:0}.coinbox,.shoplink{padding:9px 12px}.coinbox{background:#130d1c}.shoplink{background:#21112f;border-color:#4b2869;transition:.15s ease}.shoplink:hover{background:#2b153d;border-color:#6d3a91}.live{margin-top:0;padding:15px 18px;border-radius:15px;box-shadow:none;background:linear-gradient(145deg,rgba(22,15,32,.96),rgba(15,10,23,.96))}.live-title{font-size:11px;text-transform:uppercase;letter-spacing:.08em}.live-main{font-size:16px}.live-hint{font-size:11px}.card:not(.live){margin-top:14px}.card h2{font-size:24px}.muted{font-size:14px}.inventory{margin-top:16px}@media(max-width:620px){main{padding-top:14px}.top{flex-direction:column;align-items:stretch;gap:12px}.top-right{justify-content:space-between;gap:8px}.user{text-align:left;max-width:120px;overflow:hidden;text-overflow:ellipsis}.economybar{justify-content:flex-end}.brand-mark{width:31px;height:31px}.live{flex-direction:row;align-items:center}.live-side{text-align:right}}\n</style>');
          }
          return originalSend(body);
        };
        return handler(req,res,next);
      });
    }
    return originalGet.call(this,path,...handlers);
  };
}
