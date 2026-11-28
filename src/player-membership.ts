import type {Express,RequestHandler} from 'express';
import {membershipPageHtml,membershipPageJs} from './membership-page.js';

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

export function installPlayerMembership(app:Express,user:RequestHandler,db:any){
 const noStore:RequestHandler=(_req,res,next)=>{res.set('Cache-Control','private,no-store');next()};
 const page=membershipPageHtml
  .replace(/<nav class="membership-nav">[\s\S]*?<\/nav>/,'<nav class="membership-nav"><a href="/account">Мой профиль</a><a href="/shop">Магазин</a></nav>')
  .replace(/<div class="membership-header-actions">[\s\S]*?<\/div>/,'')
  .replace(/<p class="member-closed">[\s\S]*?<\/p>/,'')
  .replace('/api/admin/monetization/membership-page-script','/membership/script');
 const script=membershipPageJs
  .replace("p.visibility==='admin_test'","p.visibility==='players'")
  .replace("Покупка пока недоступна в этом предпросмотре.","Продажи этого тарифа пока закрыты.")
  .replace("Для тестовой оплаты","Для оплаты")
  .replace("fetch('/api/admin/monetization/draft',{cache:'no-store'})","playerData().then(d=>({ok:true,json:async()=>({config:d.config})}))")
  .replace("fetch('/api/admin/monetization/stars',{cache:'no-store'})","playerData().then(d=>({ok:true,json:async()=>d.stars}))")
  .replace("b.disabled=t==='lite'&&tier==='plus'","b.disabled=config[t].visibility!=='players'||(t==='lite'&&tier==='plus');if(config[t].visibility!=='players')b.textContent='Продажи закрыты'");
 const loader="let pending=null;function playerData(){if(!pending)pending=fetch('/membership/state',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Подписки недоступны');return r.json()}).finally(()=>{pending=null});return pending}";
 app.get('/membership',noStore,user,(_req,res)=>res.type('html').send(page));
 app.get('/membership/script',noStore,user,(_req,res)=>res.type('application/javascript').send('(()=>{'+loader+';'+script+'})();'));
 app.get('/membership/state',noStore,user,async(_req,res)=>{
  try{
   const actor=String(res.locals.session.twitchUserId);
   const [draft,rights,account,control]=await Promise.all([
    db.from('rewards_monetization_draft').select('config').eq('id',true).single(),
    db.rpc('rewards_stars_entitlements',{p_actor:actor}),
    db.from('rewards_users').select('id,banned').eq('twitch_user_id',actor).maybeSingle(),
    db.from('rewards_stars_pilot_control').select('enabled,fulfillment_ready,support_url').eq('id',true).single()
   ]);
   if([draft,rights,account,control].some(row=>row.error))throw Error();
   if(!account.data||account.data.banned)return void res.sendStatus(403);
   const link=await db.from('rewards_bonus_telegram_links').select('user_id').eq('user_id',account.data.id).maybeSingle();
   if(link.error)throw Error();
   const config=Object.fromEntries(['lite','plus'].map(k=>{
    const p=draft.data.config[k];if(!Number.isSafeInteger(p.stars)||p.stars<1)throw Error();
    return [k,{stars:p.stars,visibility:p.visibility==='players'?'players':'hidden'}];
   }));
   const botUsername=(process.env.BONUS_TELEGRAM_BOT_USERNAME||'').replace(/^@/,'');
   res.json({config,stars:{linked:!!link.data,entitlements:{tier:rights.data.tier,expiresAt:rights.data.expiresAt},control:control.data,botUsername,relayConfigured:!!process.env.BONUS_TELEGRAM_RELAY_SECRET&&!!botUsername}});
  }catch{res.status(503).json({error:'membership_unavailable'})}
 });
}
