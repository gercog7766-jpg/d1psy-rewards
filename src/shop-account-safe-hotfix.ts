import express from 'express';

// Keep the legacy shop DOM on /account (hidden) because the account loader still
// references #shopGrid while loading status, inventory and economy data.
// The dedicated shop page remains /shop; this only prevents the old DOM removal
// from aborting the account loader with a null-element exception.
export function installShopAccountSafeHotfix(){
  const response:any=(express as any).response;
  const original=response.send;
  if(response.__shopAccountSafe)return;
  response.__shopAccountSafe=true;
  response.send=function(body:any){
    if(typeof body==='string'&&body.includes('<title>Личный кабинет — d1psy Rewards</title>')){
      // Make the older shop-page remover skip this response, while preserving the visible title.
      body=body.replace('<title>Личный кабинет — d1psy Rewards</title>','<title>Личный кабинет — d1psy Rewards </title>');
      body=body.replace('href="#shop">Магазин</a>','href="/shop">Магазин</a>');
      body=body.replace('<section id="shop" class="card">','<section id="shop" class="card" style="display:none!important" aria-hidden="true">');
    }
    return original.call(this,body);
  };
}
