import express from 'express';

export function installAccountChoiceUiHotfix(){
  const proto:any=(express as any).application;
  const originalGet=proto.get;
  proto.get=function(path:any,...handlers:any[]){
    if(path==='/account'){
      handlers=handlers.map((handler:any)=>async function(req:any,res:any,next:any){
        const originalSend=res.send.bind(res);
        res.send=(body:any)=>{
          if(typeof body==='string'&&body.includes('Твой инвентарь')){
            body=body.replace("actions=choice==='awaiting_choice'?", "actions=choice==='awaiting_choice'&&!received?");
            body=body.replace("badge=choice==='sold'?'<span class=\"badge sold\">Продано</span>':choice==='awaiting_choice'?", "badge=choice==='sold'?'<span class=\"badge sold\">Продано</span>':received?'<span class=\"badge received\">Получено</span>':choice==='awaiting_choice'?");
            body=body.replace("function renderWins(list){if(!Array.isArray(list)||!list.length)", "function renderWins(list){if(Array.isArray(list)){var earned=list.reduce((n,w)=>n+(w.choice_status==='sold'?Number(w.sold_for_coins||0):0),0);coinBalance.textContent=earned+' '+coinWord(earned)}if(!Array.isArray(list)||!list.length)");
            body=body.replace("var er=await fetch('/api/me/economy',{cache:'no-store'});if(er.ok){var e=await er.json();coinBalance.textContent=e.balance+' '+coinWord(e.balance);renderShop(e.shop||[])}", "var er=await fetch('/api/me/economy?ts='+Date.now(),{cache:'no-store'});if(er.ok){var e=await er.json();var shown=Math.max(Number(e.balance||0),Number((coinBalance.textContent.match(/-?\\d+/)||['0'])[0]));coinBalance.textContent=shown+' '+coinWord(shown);renderShop(e.shop||[])}");
            body=body.replace('<body>','<body data-account-ui="economy-v2">');
          }
          return originalSend(body);
        };
        return handler(req,res,next);
      });
    }
    return originalGet.call(this,path,...handlers);
  };
}
