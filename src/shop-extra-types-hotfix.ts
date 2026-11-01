import express from 'express';

export function installShopExtraTypesHotfix(){
  const response:any=(express as any).response;
  const originalSend=response.send;
  response.send=function(body:any){
    if(typeof body==='string'){
      if(body.includes('<title>Магазин — d1psy Rewards</title>')){
        body=body.replace(
          '<label><input type="checkbox" data-type="gloves"> 🧤 Перчатки</label>',
          '<label><input type="checkbox" data-type="gloves"> 🧤 Перчатки</label><label><input type="checkbox" data-type="agent"> 👤 Агент</label><label><input type="checkbox" data-type="charm"> Брелок</label><label><input type="checkbox" data-type="sticker"> Наклейка</label>'
        );
      }
      if(body.includes("function ok(x)")&&body.includes("data-type")){
        body=body.replace(
          "z==='knife'?/(нож|knife)/i.test(name):/(перчат|gloves|обмотки рук)/i.test(name)",
          "z==='knife'?/(нож|knife)/i.test(name):z==='gloves'?/(перчат|gloves|обмотки рук)/i.test(name):z==='agent'?/(солдат|агент|agent|феникс|кавалерия|фбр|антитеррор)/i.test(name):z==='charm'?/(брелок|charm)/i.test(name):/(наклейка|sticker)/i.test(name)"
        );
      }
    }
    return originalSend.call(this,body);
  };
}
