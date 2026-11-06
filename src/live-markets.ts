export const liveMarkets=[
 {key:'winner',title:'Исход матча',hint:'Победитель с учётом дополнительного времени',options:[{key:'p1',label:'П1 · d1psy',odds:'1.85'},{key:'p2',label:'П2 · enemy',odds:'1.85'}]},
 {key:'regulation',title:'Победа в основное время',hint:'Только основное время, без овертаймов',options:[{key:'p1',label:'П1 · d1psy',odds:'1.90'},{key:'p2',label:'П2 · enemy',odds:'1.90'}]},
 {key:'total',title:'Тотал матча · 18.5',hint:'Общее число раундов: больше — от 19, меньше — до 18',options:[{key:'over',label:'Больше 18.5',odds:'1.85'},{key:'under',label:'Меньше 18.5',odds:'1.85'}]},
 {key:'ace',title:'ACE в матче',hint:'Один игрок устраняет всех пятерых соперников за раунд',options:[{key:'yes',label:'Да',odds:'8.00'},{key:'no',label:'Нет',odds:'1.05'}]},
 {key:'knife',title:'Нож в матче',hint:'Хотя бы одно убийство ножом',options:[{key:'yes',label:'Да',odds:'3.00'},{key:'no',label:'Нет',odds:'1.36'}]},
 {key:'grenade',title:'Килл гранатой в матче',hint:'Хотя бы одно убийство осколочной гранатой HE',options:[{key:'yes',label:'Да',odds:'20.00'},{key:'no',label:'Нет',odds:'1.02'}]}
] as const;
export function validLiveUpdate(key:string,body:any){const market=liveMarkets.find(m=>m.key===key);return !!market&&Number.isInteger(body?.version)&&body.version>=0&&typeof body.enabled==='boolean'&&(body.result===null||[...market.options.map(o=>o.key),'void',...(key==='regulation'?['draw']:[])].includes(body.result))&&!(body.enabled&&body.result!==null)}
