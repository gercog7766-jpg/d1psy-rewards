import express from 'express';

const CSS=`<style id="shopCartClearV2">.cartClear{padding:9px 12px;border:1px solid #6b3d72;border-radius:9px;background:#21152e;color:#ddd;font-weight:800;cursor:pointer}.cartClear:hover{border-color:#a855f7;color:#fff}.cartClear:disabled{opacity:.4;cursor:not-allowed}.cartHeadActions{display:flex;align-items:center;gap:8px}</style>`;

export function installShopCartClearHotfix(){
 const response:any=(express as any).response;if(response.__shopCartClearV2)return;response.__shopCartClearV2=true;const original=response.send;
 response.send=function(body:any){
  if(typeof body==='string'&&body.includes('<title>Магазин — d1psy Rewards</title>')&&body.includes('id="cartPanel"')&&!body.includes('shopCartClearV2')){
   body=body.replace('</head>',CSS+'</head>');
   body=body.replace('<button id="cartClose" class="cartRemove" type="button">✕</button>','<div class="cartHeadActions"><button id="cartClear" class="cartClear" type="button">Очистить корзину</button><button id="cartClose" class="cartRemove" type="button">✕</button></div>');
  }
  if(typeof body==='string'&&body.includes("cartStorageKey='d1psy_shop_cart_v2'")){
   body=body.replace("fetch('/api/me/shop-variant-test/'+encodeURIComponent(x.itemId)+'/buy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({variantId:x.variantId})})","fetch('/api/me/shop/'+encodeURIComponent(x.itemId)+'/variant/'+encodeURIComponent(x.variantId)+'/buy',{method:'POST'})");
   if(!body.includes("q('#cartClear')")){
    body=body.replace("var buy=q('#cartBuy');if(buy)buy.disabled=!shopCart.length||total>shopBalance}","var buy=q('#cartBuy');if(buy)buy.disabled=!shopCart.length||total>shopBalance;var clr=q('#cartClear');if(clr)clr.disabled=!shopCart.length}");
    body=body.replace("if(q('#cartClose'))q('#cartClose').onclick=function(){q('#cartPanel').classList.remove('on')};if(q('#cartBuy'))q('#cartBuy').onclick=cartCheckout;","if(q('#cartClose'))q('#cartClose').onclick=function(){q('#cartPanel').classList.remove('on')};if(q('#cartClear'))q('#cartClear').onclick=function(){if(!shopCart.length)return;if(confirm('Очистить корзину?')){shopCart=[];cartSave();cartRender()}};if(q('#cartBuy'))q('#cartBuy').onclick=cartCheckout;");
   }
  }
  return original.call(this,body);
 };
}
