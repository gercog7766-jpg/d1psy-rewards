import express from 'express';

const SIDE='<aside id="side"><h3>Цена</h3><div class="price"><input id="lo" type="number" min="0" step="1" placeholder="Цена от"><input id="hi" type="number" min="0" step="1" placeholder="Цена до"></div><h3>Износ</h3><div class="opts"><label><input type="checkbox" data-wear="FN"> FN</label><label><input type="checkbox" data-wear="MW"> MW</label><label><input type="checkbox" data-wear="FT"> FT</label><label><input type="checkbox" data-wear="WW"> WW</label><label><input type="checkbox" data-wear="BS"> BS</label></div><h3>Другое</h3><div class="opts"><label><input type="checkbox" data-kind="stattrak"> StatTrak™</label><label><input type="checkbox" data-kind="normal"> Без StatTrak™</label><label><input type="checkbox" data-kind="souvenir"> Сувенирные</label><label><input type="checkbox" data-kind="not-souvenir"> Не сувенирные</label></div><h3>Тип предмета</h3><div class="opts"><label><input type="checkbox" data-type="knife"> 🔪 Ножи</label><label><input type="checkbox" data-type="gloves"> 🧤 Перчатки</label></div><p class="note">Редкость добавим после классификации скинов.</p><button id="reset">Сбросить фильтры</button></aside>';

export function installShopPublicHotfix(){
  const response:any=(express as any).response;
  const originalSend=response.send;
  response.send=function(body:any){
    if(typeof body==='string'&&body.includes('<title>Магазин — d1psy Rewards</title>')&&!body.includes('id="side"')){
      body=body.replace('<div class="layout"><section>','<div class="layout">'+SIDE+'<section>');
      body=body.replace('grid-template-columns:1fr;gap:16px','grid-template-columns:285px minmax(0,1fr);gap:16px');
      body=body.replace('</style>','@media(max-width:900px){#filterBtn{display:block!important}}</style>');
      body=body.replace('<script>window.D1P=false;</script>','<script>window.D1P=true;</script>');
    }
    return originalSend.call(this,body);
  };
}
