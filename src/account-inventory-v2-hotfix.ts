import express from 'express';

export function installAccountInventoryV2Hotfix(){
 const response:any=(express as any).response;
 if(response.__accountInventoryV2)return;
 response.__accountInventoryV2=true;
 const original=response.send;
 response.send=function(body:any){
  if(typeof body==='string'&&body.includes('<title>Личный кабинет — d1psy Rewards</title>')){
   // Pagination hotfix must not replace the master inventory when it is called
   // with inventoryItems from a pager click.
   body=body.replace(
    'function renderWins(list,page){inventoryItems=Array.isArray(list)?list.slice():[];',
    'function renderWins(list,page){if(Array.isArray(list)&&list!==inventoryItems)inventoryItems=list.slice();'
   );
   // Inventory-filters hotfix is installed after pagination and emits this form.
   body=body.replace(
    'function renderWins(list,page){if(Array.isArray(list)){inventoryItems=list.slice();updateInventoryValue()}list=inventoryFiltered();',
    'function renderWins(list,page){if(Array.isArray(list)&&list!==inventoryItems){inventoryItems=list.slice();updateInventoryValue()}list=inventoryFiltered();'
   );
   // Upgrader sources stay in history, have no actions and are explicitly lost.
   body=body.replace(
    "actions=choice==='awaiting_choice'&&!received?",
    "actions=choice==='upgraded'?'':choice==='awaiting_choice'&&!received?"
   );
   body=body.replace(
    "badge=choice==='sold'?'<span class=\"badge sold\">Продано</span>':received?",
    "badge=choice==='upgraded'?'<span class=\"badge sold\">ПРОИГРАН</span>':choice==='sold'?'<span class=\"badge sold\">Продано</span>':received?"
   );
  }
  return original.call(this,body);
 };
}
