import express from 'express';

export function installShopVariantRouteFixHotfix(){
  const response:any=(express as any).response;
  if(response.__shopVariantRouteFixV2)return;
  response.__shopVariantRouteFixV2=true;
  const original=response.send;
  response.send=function(body:any){
    if(typeof body==='string'&&body.includes('/api/me/shop-variant-test/')){
      body=body.replaceAll(
        "fetch('/api/me/shop-variant-test/'+encodeURIComponent(id)+'/buy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({variantId:vid})})",
        "fetch('/api/me/shop/'+encodeURIComponent(id)+'/variant/'+encodeURIComponent(vid)+'/buy',{method:'POST'})"
      );
      body=body.replaceAll(
        "fetch('/api/me/shop-variant-test/'+encodeURIComponent(x.itemId)+'/buy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({variantId:x.variantId})})",
        "fetch('/api/me/shop/'+encodeURIComponent(x.itemId)+'/variant/'+encodeURIComponent(x.variantId)+'/buy',{method:'POST'})"
      );
    }
    return original.call(this,body);
  };
}
