import express from 'express';

export function installAccountUpgradedHideHotfix(){
  const response:any=(express as any).response;
  if(response.__accountUpgradedHideV1)return;
  response.__accountUpgradedHideV1=true;
  const original=response.send;
  response.send=function(body:any){
    if(typeof body==='string'&&body.includes('<title>Личный кабинет — d1psy Rewards</title>')&&!body.includes('__hideUpgradedWins')){
      body=body.replace(
        'function renderWins(list){if(Array.isArray(list)){',
        "function renderWins(list){/*__hideUpgradedWins*/if(Array.isArray(list))list=list.filter(w=>w&&w.choice_status!=='upgraded');if(Array.isArray(list)){"
      );
    }
    return original.call(this,body);
  };
}
