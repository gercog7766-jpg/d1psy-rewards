import express from 'express';

export function installInventoryPaginationHotfix(){
 const response:any=(express as any).response;
 const originalSend=response.send;
 response.send=function(body:any){
  if(typeof body==='string'&&body.includes('id="inventory"')&&body.includes('function renderWins(')){
   body=body.replace('</style>',`\n#inventory{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.inventory-pager{display:flex;flex-direction:column;align-items:flex-start;gap:4px;margin:18px 0 4px;padding:0 8px}.inventory-page-count{color:#988c9f;font-size:12px;font-weight:400}.inventory-page-links{display:flex;align-items:center;gap:3px}.inventory-page-btn{min-width:28px;min-height:32px;border:0;border-radius:5px;padding:3px 6px;background:transparent;color:#a89bac;font:400 16px/1.2 Arial,sans-serif;cursor:pointer}.inventory-page-btn:hover{color:#fff;background:#ffffff08}.inventory-page-btn.active{color:#fff;background:transparent;font-weight:700}.inventory-page-btn.inventory-page-arrow{color:#d3a14c;font-size:23px;font-weight:400}.inventory-page-btn:disabled{opacity:.3;cursor:not-allowed}.inventory-page-btn:disabled:hover{background:transparent}.inventory-page-btn:focus-visible{outline:2px solid #d3a14c;outline-offset:2px}@media(max-width:620px){.inventory-page-btn{min-width:36px;min-height:40px}}@media(max-width:900px){#inventory{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){#inventory{grid-template-columns:1fr}}\n</style>`);
   body=body.replace('function renderWins(list){',`var inventoryPage=1,inventoryPageSize=16,inventoryItems=[];function renderWins(list,page){inventoryItems=Array.isArray(list)?list.slice():[];var pages=Math.max(1,Math.ceil(inventoryItems.length/inventoryPageSize));inventoryPage=Math.min(Math.max(1,Number(page||inventoryPage)||1),pages);var visible=inventoryItems.slice((inventoryPage-1)*inventoryPageSize,inventoryPage*inventoryPageSize);list=visible;`);
   body=body.replace("inventory.innerHTML=Array.isArray(list)&&list.length?", "inventory.innerHTML=Array.isArray(list)&&list.length?");
   const marker="document.querySelectorAll('[data-claim]').forEach";
   const idx=body.indexOf(marker);
   if(idx!==-1){
    const insert=`var oldInventoryPager=document.getElementById('inventoryPager');if(oldInventoryPager)oldInventoryPager.remove();var invPages=Math.max(1,Math.ceil(inventoryItems.length/inventoryPageSize));if(inventoryItems.length>inventoryPageSize){inventory.insertAdjacentHTML('afterend','<nav id="inventoryPager" class="inventory-pager" aria-label="Страницы инвентаря"></nav>');var invPager=document.getElementById('inventoryPager');var invHtml='<span class="inventory-page-count">Всего страниц: '+invPages+'</span><div class="inventory-page-links"><button type="button" class="inventory-page-btn inventory-page-arrow" aria-label="Предыдущая страница" data-inventory-page="'+(inventoryPage-1)+'" '+(inventoryPage===1?'disabled':'')+'>‹</button>';var invStart=Math.max(1,Math.min(inventoryPage-2,invPages-4)),invEnd=Math.min(invPages,invStart+4);for(var ip=invStart;ip<=invEnd;ip++)invHtml+='<button type="button" class="inventory-page-btn '+(ip===inventoryPage?'active':'')+'" aria-label="Страница '+ip+'" '+(ip===inventoryPage?'aria-current="page"':'')+' data-inventory-page="'+ip+'">'+ip+'</button>';invHtml+='<button type="button" class="inventory-page-btn inventory-page-arrow" aria-label="Следующая страница" data-inventory-page="'+(inventoryPage+1)+'" '+(inventoryPage===invPages?'disabled':'')+'>›</button></div>';invPager.innerHTML=invHtml;invPager.querySelectorAll('[data-inventory-page]').forEach(b=>b.onclick=()=>{renderWins(inventoryItems,Number(b.dataset.inventoryPage))})}`;
    body=body.slice(0,idx)+insert+body.slice(idx);
   }
  }
  return originalSend.call(this,body);
 };
}
