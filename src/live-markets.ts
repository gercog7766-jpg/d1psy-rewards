export const liveMarkets=[
 {key:'winner',title:'Исход матча',hint:'Победитель с учётом дополнительного времени',options:[{key:'p1',label:'П1 · D1PSY',odds:'1.85'},{key:'p2',label:'П2 · ENEMY',odds:'1.85'}]},
 {key:'regulation',title:'Победа в основное время',hint:'Только основное время, без овертаймов',options:[{key:'p1',label:'П1 · D1PSY',odds:'1.90'},{key:'p2',label:'П2 · ENEMY',odds:'1.90'}]},
 {key:'total',title:'Тотал матча · 18.5',hint:'',options:[{key:'over',label:'Больше 18.5',odds:'1.85'},{key:'under',label:'Меньше 18.5',odds:'1.85'}]},
 {key:'ace',title:'ACE в матче',hint:'Один игрок устраняет всех пятерых соперников за раунд',options:[{key:'yes',label:'Да',odds:'8.00'},{key:'no',label:'Нет',odds:'1.05'}]},
 {key:'knife',title:'Нож в матче',hint:'',options:[{key:'yes',label:'Да',odds:'3.00'},{key:'no',label:'Нет',odds:'1.36'}]},
 {key:'grenade',title:'Килл любой гранатой',hint:'',options:[{key:'yes',label:'Да',odds:'20.00'},{key:'no',label:'Нет',odds:'1.02'}]}
] as const;
export function validLiveUpdate(key:string,body:any){const market=liveMarkets.find(m=>m.key===key);return !!market&&Number.isInteger(body?.version)&&body.version>=0&&typeof body.enabled==='boolean'&&(body.result===null||[...market.options.map(o=>o.key),'void',...(key==='regulation'?['draw']:[])].includes(body.result))&&!(body.enabled&&body.result!==null)}

export function validLiveOdds(key:string,odds:any){const market=liveMarkets.find(m=>m.key===key);return !!market&&!!odds&&typeof odds==='object'&&!Array.isArray(odds)&&Object.keys(odds).length===2&&market.options.every(o=>typeof odds[o.key]==='number'&&Number.isFinite(odds[o.key])&&odds[o.key]>=1.01&&odds[o.key]<=1000&&Math.abs(odds[o.key]*100-Math.round(odds[o.key]*100))<1e-8)}
