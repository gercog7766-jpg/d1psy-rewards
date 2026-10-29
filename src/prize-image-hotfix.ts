import express from 'express';

const sources:Record<string,string>={
'aug-creep':'https://lis-skins.com/ru/market/csgo/aug-creep-factory-new/',
'cz-framework':'https://lis-skins.com/ru/market/csgo/cz75-auto-framework-field-tested/',
'de-corinthian':'https://lis-skins.com/ru/market/csgo/desert-eagle-corinthian-factory-new/',
'five-seven-capillary':'https://lis-skins.com/market/csgo/five-seven-capillary-factory-new/',
'glock-umbral-rabbit':'https://lis-skins.com/ru/market/csgo/glock-18-umbral-rabbit-factory-new/',
'm249-sleet':'https://lis-skins.com/market/csgo/m249-sleet-field-tested/',
'm4a1-electrum':'https://lis-skins.com/ru/market/csgo/m4a1-s-electrum-factory-new/',
'm4a1-emphorosaur':'https://lis-skins.com/ru/market/csgo/m4a1-s-emphorosaur-s-factory-new/',
'm4a4-steel-work':'https://lis-skins.com/ru/market/csgo/m4a4-steel-work-factory-new/',
'm4a4-aeolian-dark':'https://lis-skins.com/ru/market/csgo/m4a4-aeolian-dark-factory-new/',
'mac10-storm-camo':'https://lis-skins.com/market/csgo/mac-10-storm-camo-field-tested/',
'p250-sleet':'https://lis-skins.com/ru/market/csgo/p250-sleet-factory-new/',
'p90-sand-spray':'https://lis-skins.com/market/csgo/p90-sand-spray-field-tested/',
'scar20-sand-mesh':'https://lis-skins.com/market/csgo/scar-20-sand-mesh-field-tested/',
'tec9-citric-acid':'https://lis-skins.com/market/csgo/tec-9-citric-acid-field-tested/',
'usp-silent-shot':'https://lis-skins.com/ru/market/csgo/usp-s-silent-shot-minimal-wear/',
'xm1014-irezumi':'https://lis-skins.com/ru/market/csgo/xm1014-irezumi-field-tested/',
'zeus-swamp-ddpat':'https://lis-skins.com/market/csgo/zeus-x27-swamp-ddpat-field-tested/',
'galil-grey-smoke':'https://lis-skins.com/market/csgo/galil-ar-grey-smoke-battle-scarred/'
};
const cache=new Map<string,string>();

export function installPrizeImageHotfix(){
 const proto:any=(express as any).application, originalGet=proto.get;
 proto.get=function(path:any,...handlers:any[]){
  if(path!=='/api/prize-image/:key') return originalGet.call(this,path,...handlers);
  return originalGet.call(this,path,async(req:any,res:any)=>{
   try{
    const key=String(req.params.key||''),page=sources[key]; if(!page)return res.sendStatus(404);
    let image=cache.get(key);
    if(!image){
     const r=await fetch(page,{headers:{'user-agent':'Mozilla/5.0 d1psy-rewards/1.0'}}); if(!r.ok)throw new Error('source '+r.status);
     const html=await r.text();
     const m=html.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/i)||html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/i);
     if(!m?.[1])throw new Error('image missing'); image=m[1].replace(/&amp;/g,'&'); cache.set(key,image);
    }
    res.set('Cache-Control','public,max-age=21600'); return res.redirect(302,image);
   }catch(e){console.error('prize image',req.params.key,e);return res.sendStatus(404)}
  });
 };
}
