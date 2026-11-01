import express from 'express';

export function installToastActionsHotfix(){const response:any=(express as any).response;if(response.__toastActionsV2)return;response.__toastActionsV2=true;const original=response.send;response.send=function(body:any){if(typeof body==='string'){
if(body.includes('<title>Магазин — d1psy Rewards</title>')){
body=body.replace(/alert\(j\.error==='insufficient_coins'\?'Недостаточно Монет\.':j\.error==='trade_url_required'\?'Сначала добавь Steam Trade URL\.':'Ошибка покупки\.'\)/g,"window.d1ShopError?window.d1ShopError(j,0,0):void 0");
body=body.replace(/alert\('Покупка оформлена\.'\)/g,"window.d1Toast?window.d1Toast('Предмет добавлен в историю покупок.','success','Покупка оформлена'):void 0");
body=body.replace(/alert\(([^;]+)\)/g,"window.d1Toast?window.d1Toast(String($1||'Ошибка'),'error','Ошибка'):void 0");
}
if(body.includes('promoUiFixMarker')&&!body.includes('toastPromoV1')){
body=body.replace('<div id="promoUiFixMarker"></div>','<div id="promoUiFixMarker"></div><div id="toastPromoV1"></div>');
body=body.replace('if(q.ok){x.textContent=j.rewardType==="coins"?"Промокод активирован: +"+j.amount+" Монет":"Промокод активирован. Предмет добавлен в инвентарь.";setTimeout(function(){location.reload()},900)}else{x.textContent=j.error==="already_used"?"Вы уже активировали этот промокод":j.error==="limit_reached"?"Лимит активаций промокода исчерпан":j.error==="expired"?"Срок действия промокода истёк":"Промокод недействителен";r.disabled=false}', 'if(q.ok){var pm=j.rewardType==="coins"?"Промокод активирован: +"+j.amount+" Монет":"Промокод активирован. Предмет добавлен в инвентарь.";x.textContent=pm;if(window.d1Toast)window.d1Toast(pm,"success","Промокод активирован");setTimeout(function(){location.reload()},1200)}else{var pe=j.error==="already_used"?"Вы уже активировали этот промокод":j.error==="limit_reached"?"Лимит активаций промокода исчерпан":j.error==="expired"?"Срок действия промокода истёк":"Промокод недействителен";x.textContent=pe;if(window.d1Toast)window.d1Toast(pe,"error","Промокод");r.disabled=false}');
}
}return original.call(this,body)}}
