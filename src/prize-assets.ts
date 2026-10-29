import express from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const svg=(title:string,subtitle:string,accent='#8b5cf6')=>`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480"><defs><radialGradient id="g"><stop stop-color="${accent}" stop-opacity=".28"/><stop offset="1" stop-color="#100b18" stop-opacity="0"/></radialGradient></defs><rect width="800" height="480" fill="#100b18"/><rect width="800" height="480" fill="url(#g)"/><text x="400" y="225" fill="#fff" font-family="Arial,sans-serif" font-size="38" font-weight="700" text-anchor="middle">${title}</text><text x="400" y="275" fill="#c4b5fd" font-family="Arial,sans-serif" font-size="24" text-anchor="middle">${subtitle}</text></svg>`;
const load=(name:string,fallback:string)=>{try{return readFileSync(join(process.cwd(),'assets','prizes',name),'utf8')}catch{return fallback}};
const assets:Record<string,string>={
'paris-2023':load('paris-2023-user.svg',svg('BLAST.TV Major','Paris 2023','#eab308')),
'graffiti-crown':load('graffiti-crown-user.svg',svg('Sealed Graffiti','Crown','#eab308')),
'p250-sleet':svg('P250 | Sleet','Ледяная корка','#38bdf8'),
'xm1014-irezumi':svg('XM1014 | Irezumi','Ирэдзуми'),
'm249-sleet':svg('M249','Ледяная корка','#38bdf8'),
'm4a4-steel-work':svg('M4A4','Стальной каркас','#94a3b8'),
'm4a4-aeolian-dark':svg('M4A4','Эолова тьма','#7c3aed'),
'mac10-storm-camo':svg('MAC-10','Грозовой камуфляж','#64748b'),
'p90-sand-spray':svg('P90','Песчаное напыление','#d6b36a'),
'scar20-sand-mesh':svg('SCAR-20','Песчаная сетка','#d6b36a'),
'tec9-citric-acid':svg('Tec-9','Лимонная кислота','#bef264'),
'zeus-swamp-ddpat':svg('Zeus x27','Пиксельный камуфляж «Болото»','#65a30d'),
'galil-grey-smoke':svg('Galil AR','Серый дым','#94a3b8'),
'cz-framework':svg('CZ75-Auto','Фреймворк','#f97316'),
'de-corinthian':svg('Desert Eagle','Послание коринфянам','#eab308'),
'five-seven-capillary':svg('Five-SeveN','Капилляры','#ef4444'),
'glock-umbral-rabbit':svg('Glock-18','Кролик в тени','#a78bfa'),
'usp-silent-shot':svg('USP-S','Silent Shot','#60a5fa'),
'm4a1-electrum':svg('M4A1-S','Electrum','#facc15'),
'aug-creep':svg('AUG','Жуть','#22c55e'),
'm4a1-emphorosaur':svg('M4A1-S','Эмфорозавр-S','#84cc16')};

export function installPrizeAssets(){
 const proto:any=(express as any).application;
 const originalUse=proto.use;
 let installed=false;
 proto.use=function(...args:any[]){
  if(!installed){
   installed=true;
   originalUse.call(this,(req:any,res:any,next:any)=>{
    const m=String(req.path||req.url||'').match(/^\/assets\/prizes\/([a-z0-9-]+)\.svg$/i);
    if(!m)return next();
    const body=assets[m[1]];
    if(!body)return res.status(404).end();
    res.status(200).set('Content-Type','image/svg+xml; charset=utf-8').set('Cache-Control','no-cache').send(body);
   });
  }
  return originalUse.apply(this,args);
 };
}
