import express from 'express';

export function installShopDynamicPriceHotfix(){
  const response:any=(express as any).response;
  const originalSend=response.send;
  response.send=function(body:any){
    if(typeof body==='string'&&body.includes("function draw(){")&&body.includes("Number(x.price_coins)+' Монет")){
      const helper="window.__D1P_DYNAMIC_PRICE__='v2';function cardPrice(x){var m=cat[String(x.id)]||{variants:[]};if(!P||!m.variants||!m.variants.length)return Number(x.price_coins);var ws=sel('[data-wear]','wear'),ks=sel('[data-kind]','kind'),vs=m.variants.filter(function(v){return v.available&&v.price_coins!=null});if(ws.length)vs=vs.filter(function(v){return ws.indexOf(v.wear)>=0});if(ks.length){vs=vs.filter(function(v){return ks.some(function(z){if(z==='not-souvenir')return v.variant_kind!=='souvenir';return v.variant_kind===z})})}else{var normal=vs.filter(function(v){return v.variant_kind==='normal'});if(normal.length)vs=normal}if(!vs.length)return Number(x.price_coins);if(ws.length===1){var exact=vs.find(function(v){return v.wear===ws[0]});if(exact)return Number(exact.price_coins)}if(!ws.length){var pref=['FT','WW','BS','MW','FN'];for(var i=0;i<pref.length;i++){var chosen=vs.find(function(v){return v.wear===pref[i]});if(chosen)return Number(chosen.price_coins)}}return Number(vs[0].price_coins)}";
      if(!body.includes('__D1P_DYNAMIC_PRICE__')) body=body.replace('function draw(){',helper+'function draw(){');
      body=body.replace(/Number\(x\.price_coins\)\+' Монет/g,"cardPrice(x)+' Монет");
    }
    return originalSend.call(this,body);
  };
}
