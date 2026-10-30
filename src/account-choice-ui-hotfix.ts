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
            body=body.replace("choice=w.choice_status||(w.delivery_status==='awaiting_choice'?'awaiting_choice':'claimed'),price=p.sell_price_coins", "choice=w.choice_status||(w.delivery_status==='awaiting_choice'?'awaiting_choice':'claimed'),price=p.sell_price_coins??({'Наклейка | Париж-2023':3,'XM1014 | Ирэдзуми':5,'P250 | Ледяная корка':3,'Запечатанный граффити':3,'Tec-9 | Лимонная кислота':3,'M4A4 | Стальной каркас':4,'M4A4 | Эолова тьма':5,'MAC-10 | Грозовой камуфляж':3,'M249 | Ледяная корка':3,'Автомат «Галиль» | Серый дым':3,'Zeus x27 | Пиксельный камуфляж «Болото»':3,'P90 | Песчаное напыление':3,'SCAR-20 | Песчаная сетка':3,'CZ75-Auto | Фреймворк':20,'Desert Eagle | Послание коринфянам':30,'Five-SeveN | Капилляры':30,'Glock-18 | Кролик в тени':20,'USP-S | Silent Shot':18,'M4A1-S | Electrum':52,'AUG | Жуть':20,'M4A1-S | Эмфорозавр-S':34}[name]??null)");
            body=body.replace("actions=choice==='awaiting_choice'?", "actions=choice==='awaiting_choice'&&!received?");
            body=body.replace("var er=await fetch('/api/me/economy',{cache:'no-store'})", "var er=await fetch('/api/me/economy?ts='+Date.now(),{cache:'no-store'})");
          }
          return originalSend(body);
        };
        return handler(req,res,next);
      });
    }
    return originalGet.call(this,path,...handlers);
  };
}
