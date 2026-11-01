import express from 'express';

function cleanShopName(value:any){
  return String(value??'').replace(/^(?:(?:StatTrak™|StatTrak)\s+|Сувенирный\s+)+/iu,'');
}

export function installShopNameNormalizeHotfix(){
  const response:any=(express as any).response;
  const originalSend=response.send;
  response.send=function(body:any){
    if(typeof body==='string'&&body.includes('"shop"')){
      try{
        const data=JSON.parse(body);
        if(data&&Array.isArray(data.shop)){
          data.shop=data.shop.map((item:any)=>item&&typeof item==='object'?{...item,name:cleanShopName(item.name)}:item);
          body=JSON.stringify(data);
        }
      }catch{}
    }
    return originalSend.call(this,body);
  };
}
