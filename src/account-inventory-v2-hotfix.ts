import express from 'express';

export function installAccountInventoryV2Hotfix(){
 const response:any=(express as any).response;
 if(response.__accountInventoryV2)return;
 response.__accountInventoryV2=true;
 const original=response.send;
 response.send=function(body:any){
  if(typeof body==='string'&&body.includes('<title>Личный кабинет — d1psy Rewards</title>')){
   // Undo the old rule that removed upgrader-consumed items from history.
   body=body.replace("/*__hideUpgradedWins*/if(Array.isArray(list))list=list.filter(w=>w&&w.choice_status!=='upgraded');",'/*__showUpgradedWins*/');
   // Preserve the full inventory while changing pages. The old pager overwrote inventoryItems with the current page.
   body=body.replace("function renderWins(list,page){inventoryItems=Array.isArray(list)?list.slice():[];var pages=", "function renderWins(list,page){if(Array.isArray(list)&&list!==inventoryItems)inventoryItems=list.slice();var pages=");
   // Upgraded source items are history-only and must be visibly marked as lost/used, never actionable.
   body=body.replace("actions=choice==='awaiting_choice'&&!received?", "actions=choice==='upgraded'?'':choice==='awaiting_choice'&&!received?");
   body=body.replace("badge=choice==='shop_purchase'?", "badge=choice==='upgraded'?'<span class=\"badge sold\">ПРОИГРАН</span>':choice==='shop_purchase'?");
  }
  return original.call(this,body);
 };
}
