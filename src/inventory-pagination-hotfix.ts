import express from 'express';

export function installInventoryPaginationHotfix(){
 const response:any=(express as any).response;
 const originalSend=response.send;
 response.send=function(body:any){
  if(typeof body==='string'&&body.includes('id="inventory"')&&body.includes('function renderWins(')){
   body=body.replace('</style>',`\n#inventory{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.inventory-pager{display:flex;align-items:center;justify-content:center;gap:8px;margin:16px 0 4px;flex-wrap:wrap}.inventory-page-btn{min-width:38px;border:1px solid #4c1d6f;border-radius:9px;padding:8px 11px;background:#1a1026;color:#fff;font-weight:800;cursor:pointer}.inventory-page-btn.active{background:#6d28d9;border-color:#7c3aed}.inventory-page-btn:disabled{opacity:.4;cursor:not-allowed}@media(max-width:900px){#inventory{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){#inventory{grid-template-columns:1fr}}\n</style>`);
   body=body.replace('function renderWins(list){',`var inventoryPage=1,inventoryPageSize=16,inventoryItems=[];function renderWins(list,page){inventoryItems=Array.isArray(list)?list.slice():[];var pages=Math.max(1,Math.ceil(inventoryItems.length/inventoryPageSize));inventoryPage=Math.min(Math.max(1,Number(page||inventoryPage)||1),pages);var visible=inventoryItems.slice((inventoryPage-1)*inventoryPageSize,inventoryPage*inventoryPageSize);list=visible;`);
   body=body.replace("inventory.innerHTML=Array.isArray(list)&&list.length?", "inventory.innerHTML=Array.isArray(list)&&list.length?");
   const marker="document.querySelectorAll('[data-claim]').forEach";
   const idx=body.indexOf(marker);
   if(idx!==-1){
    const insert=`var oldInventoryPager=document.getElementById('inventoryPager');if(oldInventoryPager)oldInventoryPager.remove();var invPages=Math.max(1,Math.ceil(inventoryItems.length/inventoryPageSize));if(inventoryItems.length>inventoryPageSize){inventory.insertAdjacentHTML('afterend','<div id="inventoryPager" class="inventory-pager"></div>');var invPager=document.getElementById('inventoryPager');var invHtml='<button class="inventory-page-btn" data-inventory-page="'+(inventoryPage-1)+'" '+(inventoryPage===1?'disabled':'')+'>‹</button>';for(var ip=1;ip<=invPages;ip++)invHtml+='<button class="inventory-page-btn '+(ip===inventoryPage?'active':'')+'" data-inventory-page="'+ip+'">'+ip+'</button>';invHtml+='<button class="inventory-page-btn" data-inventory-page="'+(inventoryPage+1)+'" '+(inventoryPage===invPages?'disabled':'')+'>›</button>';invPager.innerHTML=invHtml;invPager.querySelectorAll('[data-inventory-page]').forEach(b=>b.onclick=()=>{renderWins(inventoryItems,Number(b.dataset.inventoryPage));document.querySelector('.inventory-head')?.scrollIntoView({behavior:'smooth',block:'start'})})}`;
    body=body.slice(0,idx)+insert+body.slice(idx);
   }
  }
  return originalSend.call(this,body);
 };
}
