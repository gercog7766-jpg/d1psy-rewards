import type {Express,RequestHandler} from 'express';
import {membershipPageHtml} from './membership-page.js';

// Pre-launch storefront. Its only actions navigate to sections on this page.
export function playerMembershipPreview(){
 const intro='<section class="membership-current"><div class="current-copy"><p class="membership-kicker">СКОРО В DROPSO</p><h2>Подписки готовятся к открытию</h2><p>Выбери оформление и сравни преимущества. Каждый тариф действует 30 дней.</p></div></section>';
 return membershipPageHtml
  .replace(/<nav class="membership-nav">[\s\S]*?<\/nav>/,'<nav class="membership-nav"><a href="#benefits">Сравнение</a><a href="#profiles">Примеры профилей</a></nav>')
  .replace(/<div class="membership-header-actions">[\s\S]*?<\/div>/,'')
  .replace(/<section class="membership-current"[\s\S]*?<\/section>/,intro)
  .replace(/<p class="member-closed">[\s\S]*?<\/p>/,'')
  .replace(/<button type="button" id="cta-free"[^>]*>[^<]*<\/button>/,'<span class="membership-cta" style="text-align:center">Базовый тариф</span>')
  .replace(/<button type="button" id="cta-(lite|plus)"[^>]*>[^<]*<\/button>/g,'<a href="#benefits" class="membership-cta" style="text-align:center">Сравнить преимущества</a>')
  .replace('<h2>Сравнение возможностей','<h2 id="benefits">Сравнение возможностей')
  .replace('<h2>Примеры профиля','<h2 id="profiles">Примеры профиля')
  .replace(/<dialog[\s\S]*?<\/dialog>/,'')
  .replace(/<script[^>]*>[\s\S]*?<\/script>/g,'');
}
export function installPlayerMembershipPreview(app:Express,admin:RequestHandler){
 const html=playerMembershipPreview();
 app.get('/admin/monetization/player-preview',admin,(_req,res)=>{
  res.set('Cache-Control','private, no-store').type('html').send(html);
 });
}
