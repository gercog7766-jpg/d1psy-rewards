import express from 'express';

const svg=(title:string,subtitle:string,accent='#8b5cf6')=>`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480"><defs><radialGradient id="g"><stop stop-color="${accent}" stop-opacity=".28"/><stop offset="1" stop-color="#100b18" stop-opacity="0"/></radialGradient></defs><rect width="800" height="480" fill="#100b18"/><rect width="800" height="480" fill="url(#g)"/><text x="400" y="225" fill="#fff" font-family="Arial,sans-serif" font-size="38" font-weight="700" text-anchor="middle">${title}</text><text x="400" y="275" fill="#c4b5fd" font-family="Arial,sans-serif" font-size="24" text-anchor="middle">${subtitle}</text></svg>`;
const assets:Record<string,string>={
'paris-2023':`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480"><rect width="800" height="480" fill="#100b18"/><circle cx="400" cy="210" r="125" fill="#f4ef19"/><circle cx="400" cy="210" r="94" fill="#29252f" stroke="#fff" stroke-width="8"/><text x="400" y="195" fill="#fff" font-family="Arial,sans-serif" font-size="36" font-weight="900" text-anchor="middle">BLAST.TV</text><text x="400" y="238" fill="#fff" font-family="Arial,sans-serif" font-size="36" font-weight="900" text-anchor="middle">MAJOR</text><text x="400" y="380" fill="#d6d3d1" font-family="Arial,sans-serif" font-size="32" font-weight="800" text-anchor="middle">PARIS 2023</text></svg>`,
'graffiti-crown':`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480"><rect width="800" height="480" fill="#100b18"/><path d="M190 330L150 145l115 80 70-135 70 135 80-140 65 145 110-85-45 185z" fill="#d8cb55" stroke="#39351c" stroke-width="18" stroke-linejoin="round"/><path d="M205 355Q400 400 595 350" fill="none" stroke="#39351c" stroke-width="22"/><path d="M245 315l25-55 25 65M385 330l25-65 30 65M515 315l25-55 25 65" fill="none" stroke="#39351c" stroke-width="12"/></svg>`,
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

// server-next registers its Express routes only after this module is installed.
// Intercept the first route registration and add the asset endpoint to the real app instance.
export function installPrizeAssets(){
 const proto:any=(express as any).application;
 const originalGet=proto.get;
 let installed=false;
 proto.get=function(path:any,...handlers:any[]){
  if(!installed){
   installed=true;
   originalGet.call(this,'/assets/prizes/:slug.svg',(req:any,res:any)=>{
    const body=assets[String(req.params.slug||'')];
    if(!body)return res.status(404).end();
    res.set('Content-Type','image/svg+xml; charset=utf-8');
    res.set('Cache-Control','public, max-age=300');
    return res.status(200).send(body);
   });
  }
  return originalGet.call(this,path,...handlers);
 };
}
