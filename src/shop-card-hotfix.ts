import express from 'express';

const CSS=`<style id="shopCardV3">.box{width:min(760px,100%);padding:0;overflow:hidden}.productHead{display:grid;grid-template-columns:250px minmax(0,1fr);gap:24px;padding:24px;background:linear-gradient(135deg,#21142f,#120c1b)}.productVisual{min-height:210px;display:flex;align-items:center;justify-content:center;border:1px solid #3d2b50;border-radius:16px;background:radial-gradient(circle,#2a183a,#100b17)}.productVisual img{width:92%;height:190px;object-fit:contain;filter:drop-shadow(0 14px 20px #0008)}.productInfo{display:flex;flex-direction:column;justify-content:center;min-width:0}.productInfo h2{margin:0 0 8px;font-size:25px;line-height:1.15}.productHint{color:#9f94ad;font-size:13px}.productBody{padding:20px 24px 24px}.pickerLabel{margin:16px 0 7px;color:#b8adc4;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.tabs,.wears{margin-top:0}.tab,.wear{cursor:pointer;transition:.15s}.tab:hover,.wear:hover{border-color:#76529a}.tab:disabled,.wear:disabled{opacity:.3;cursor:not-allowed}.priceRow{display:flex;align-items:end;justify-content:space-between;gap:16px;margin:22px 0 14px;padding-top:17px;border-top:1px solid #342442}.priceLabel{color:#9f94ad;font-size:12px}.priceRow #mp{margin:2px 0 0;font-size:27px}.coinShortage{margin-top:5px;color:#fca5a5;font-size:13px;font-weight:800}.coinShortage.ok{color:#86efac}.buy:disabled{opacity:.45;cursor:not-allowed}#close{position:absolute;right:14px;top:14px;z-index:2}.box{position:relative}@media(max-width:650px){.productHead{grid-template-columns:1fr;padding:18px;gap:14px}.productVisual{min-height:150px}.productVisual img{height:135px}.productInfo h2{font-size:20px}.productBody{padding:16px 18px 20px}.priceRow{align-items:center}}</style>`;

export function installShopCardHotfix(){
  const response:any=(express as any).response;
  const originalSend=response.send;
  response.send=function(body:any){
    if(typeof body==='string'&&body.includes('<title>Магазин — d1psy Rewards</title>')&&!body.includes('shopCardV3')){
      body=body.replace('</head>',CSS+'</head>');
      body=body.replace('<div class="box"><button id="close">Закрыть</button><h2 id="mt"></h2><div id="tabs" class="tabs"></div><div id="wears" class="wears"></div><div id="mp"></div><button id="mb" class="buy" style="width:100%">Купить</button></div>', '<div class="box"><button id="close">✕</button><div class="productHead"><div class="productVisual"><img id="mi" alt=""></div><div class="productInfo"><h2 id="mt"></h2><div class="productHint">Выберите тип и качество предмета</div></div></div><div class="productBody"><div class="pickerLabel">Тип предмета</div><div id="tabs" class="tabs"></div><div class="pickerLabel">Качество / износ</div><div id="wears" class="wears"></div><div class="priceRow"><div><div class="priceLabel">Цена выбранного варианта</div><div id="mp"></div><div id="coinShortage" class="coinShortage" style="display:none"></div></div></div><button id="mb" class="buy" style="width:100%">Купить выбранный вариант</button></div></div>');
    }
    if(typeof body==='string'&&body.includes("q('#mt').textContent=c.name")&&!body.includes("q('#mi')")){
      body=body.replace("q('#mt').textContent=c.name;q('#modal').classList.add('on');modal()", "q('#mt').textContent=c.name;var it=items.find(function(x){return String(x.id)===String(id)});var im=q('#mi');if(im){im.src=it&&it.image_url?it.image_url:'';im.alt=c.name||''}q('#modal').classList.add('on');modal()");
    }
    if(typeof body==='string'&&body.includes("var P=window.D1P===true,items=[]")&&!body.includes('shopBalance=0')){
      body=body.replace("var P=window.D1P===true,items=[]", "var P=window.D1P===true,shopBalance=0,items=[]");
      body=body.replace("q('#bal').textContent=Number(e.balance||0)+' Монет';", "shopBalance=Number(e.balance||0);q('#bal').textContent=shopBalance+' Монет';");
      body=body.replace("q('#mp').textContent=yes?Number(v.price_coins)+' Монет':'Нет в наличии';q('#mb').disabled=!yes;", "q('#mp').textContent=yes?Number(v.price_coins)+' Монет':'Нет в наличии';var cs=q('#coinShortage');if(cs){if(yes){var need=Math.max(0,Number(v.price_coins)-shopBalance);cs.style.display=need>0?'block':'none';cs.classList.remove('ok');cs.textContent=need>0?'Не хватает '+need+' Монет':''}else{cs.style.display='none';cs.textContent=''}}q('#mb').disabled=!yes;");
    }
    return originalSend.call(this,body);
  };
}
