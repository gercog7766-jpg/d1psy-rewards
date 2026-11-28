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
 app.get('/battle-pass/s2',noStore,user,async(_req,res)=>{
  try{
   const actor=String(res.locals.session.twitchUserId);
   const [draft,rights,control]=await Promise.all([db.from('rewards_monetization_draft').select('config').eq('id',true).single(),db.rpc('rewards_stars_entitlements',{p_actor:actor}),db.from('rewards_stars_pilot_control').select('enabled,fulfillment_ready,support_url').eq('id',true).single()]);
   if(draft.error||rights.error||control.error)throw Error();
   const p=draft.data.config.battlePass,tier=rights.data.tier;
   const quote=await db.rpc('rewards_stars_s2_sale_discount',{p_actor:actor,p_season:p.season,p_at:new Date().toISOString()});
   if(quote.error)throw Error();
   const bot=(process.env.BONUS_TELEGRAM_BOT_USERNAME||'').replace(/^@/,'');
   const ready=p.visibility==='players'&&control.data.enabled&&control.data.fulfillment_ready&&control.data.support_url&&quote.data!==null&&Number.isInteger(quote.data)&&/^[A-Za-z0-9_]{5,32}$/.test(bot)&&!!process.env.BONUS_TELEGRAM_RELAY_SECRET;
   const owned=rights.data.battlePasses?.some((pass:any)=>pass.season===p.season);
   const price=Math.max(1,Math.round(p.stars*(100-(quote.data??0))/100));
   const status=owned?'PREMIUM уже приобретён':ready?'Доступно к покупке':'Продажи пока закрыты';
   const button=ready&&!owned?'<a class="buy" href="https://t.me/'+bot+'?start=stars_battlePass">Купить PREMIUM · '+price+' ⭐</a>':'';
   res.type('html').send('<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NIGHT SHIFT S2 · Dropso</title><style>body{background:#100c1b;color:#f5edff;font:16px system-ui;margin:0}main{max-width:760px;padding:24px;margin:auto}section{background:radial-gradient(ellipse at 90% 0,#6b32a8,transparent 60%),#21162e;border:1px solid #77539e;border-radius:20px;padding:24px}h1{font-size:clamp(32px,7vw,58px);margin:0}a{color:#d6b6ff}.buy{display:block;background:#f7cd72;color:#211509;text-align:center;font-weight:800;border-radius:12px;padding:15px;text-decoration:none}table{width:100%;border-collapse:collapse}td,th{padding:12px;text-align:left;border-bottom:1px solid #ffffff24}</style></head><body><main><a href="/account">← Профиль</a><section><p>DROPSO · SEASON 02</p><h1>NIGHT SHIFT</h1><p>15.12.2026 — 15.03.2027 · МСК · 50 уровней · 100 наград</p><h2>PREMIUM</h2><p>Твой тариф: '+(tier==='plus'?'PLUS':tier==='lite'?'LITE':'FREE')+' · '+status+'</p><table><thead><tr><th>Тариф</th><th>10–14 декабря</th><th>С 15 декабря</th></tr></thead><tbody><tr><td>LITE</td><td>−15%</td><td>−2%</td></tr><tr><td>PLUS</td><td>−20%</td><td>−5%</td></tr><tr><td>FREE</td><td>Закрыто</td><td>Полная цена</td></tr></tbody></table><p>Задания и получение наград начнутся 15 декабря в 00:00 МСК.</p>'+button+'</section></main></body></html>');
  }catch{res.status(503).send('Battle Pass временно недоступен')}
 });

}
