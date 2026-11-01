import express from 'express';

export function installShopDynamicPriceHotfix(){
  const response:any=(express as any).response;
  const originalSend=response.send;
  response.send=function(body:any){
    if(typeof body==='string'&&body.includes("function draw(){var a=items.filter(ok)")){
      const old="function draw(){var a=items.filter(ok),pages=Math.max(1,Math.ceil(a.length/ps));";
      const helper="function cardPrice(x){var m=cat[String(x.id)]||{variants:[]};if(!P||!m.variants||!m.variants.length)return Number(x.price_coins);var ws=sel('[data-wear]','wear'),ks=sel('[data-kind]','kind'),vs=m.variants.filter(function(v){return v.available&&v.price_coins!=null});if(ws.length)vs=vs.filter(function(v){return ws.indexOf(v.wear)>=0});if(ks.length){vs=vs.filter(function(v){return ks.some(function(z){return z==='not-souvenir'?v.variant_kind!=='souvenir':v.variant_kind===z})})}else{var normal=vs.filter(function(v){return v.variant_kind==='normal'});if(normal.length)vs=normal}if(!ws.length){var pref=['FT','WW','BS','MW','FN'],chosen=null;for(var i=0;i<pref.length&&!chosen;i++)chosen=vs.find(function(v){return v.wear===pref[i]});if(chosen)return Number(chosen.price_coins)}return vs.length?Number(vs[0].price_coins):Number(x.price_coins)}function draw(){var a=items.filter(ok),pages=Math.max(1,Math.ceil(a.length/ps));";
      body=body.replace(old,helper);
      body=body.replace("'<div class=\"coins\">'+Number(x.price_coins)+' Монет</div>'","'<div class=\"coins\">'+cardPrice(x)+' Монет</div>'");
    }
    return originalSend.call(this,body);
  };
}
