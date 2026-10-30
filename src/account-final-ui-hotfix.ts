import express from 'express';

export function installAccountFinalUiHotfix(){
  const proto:any=(express as any).application;
  const originalGet=proto.get;
  proto.get=function(path:any,...handlers:any[]){
    if(path==='/account'){
      handlers=handlers.map((handler:any)=>async function(req:any,res:any,next:any){
        const originalSend=res.send.bind(res);
        res.send=(body:any)=>{
          if(typeof body==='string'&&body.includes('Твой инвентарь')){
            body=body.replace("choice=w.choice_status||(w.delivery_status==='awaiting_choice'?'awaiting_choice':'claimed')","choice=received?'claimed':(w.choice_status||(w.delivery_status==='awaiting_choice'?'awaiting_choice':'claimed'))");
            body=body.replace("function renderWins(list){if(!Array.isArray(list)||!list.length)","function renderWins(list){if(Array.isArray(list)){var earned=list.reduce((n,w)=>n+(w.choice_status==='sold'?Number(w.sold_for_coins||0):0),0);coinBalance.textContent=earned+' '+coinWord(earned)}if(!Array.isArray(list)||!list.length)");
            body=body.replace("var er=await fetch('/api/me/economy',{cache:'no-store'})","var er=await fetch('/api/me/economy?ts='+Date.now(),{cache:'no-store'})");
          }
          return originalSend(body);
        };
        return handler(req,res,next);
      });
    }
    return originalGet.call(this,path,...handlers);
  };
}
