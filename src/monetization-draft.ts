import {installPlayerMembershipPreview} from './player-membership.js';
import type {Express,RequestHandler} from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {monetizationHtml,monetizationJs} from './monetization-draft-ui.js';
import {premiumPreviewHtml,premiumPreviewJs} from './premium-preview.js';
import {seasonTwoRewardDraft,seasonTwoRules,seasonTwoThresholds} from './season-two-draft.js';
import {installSeasonTaskPreview} from './season-two-task-preview.js';
import {installSeasonTest} from './season-two-test.js';
import {installRealSeason} from './season-two-real.js';
import {installTestMembership} from './monetization-membership.js';
import {installStarsPilot} from './telegram-stars-pilot.js';
import {installStarsPlusPerks} from './stars-plus-perks.js';
import {installLiveSeason} from './season-two-live.js';
import {installSeasonSetup} from './season-two-setup.js';
import {installMembershipPage} from './membership-page.js';
import {installS2Design} from './s2-design-preview.js';
import {installMonetizationReadiness} from './monetization-readiness.js';

const visibility=z.enum(['hidden','admin_test']); // No public state exists in this release.
const membershipVisibility=z.enum(['hidden','admin_test','players']);
const plan=z.object({stars:z.number().int().min(1).max(100000),visibility:membershipVisibility,coins:z.number().int().min(0).max(10000),skins:z.number().int().min(0).max(10000),title:z.string().trim().max(80),description:z.string().trim().max(600)}).strict();
const reward=z.object({kind:z.enum(['none','title','frame','background','badge','coins','skin','other']),label:z.string().trim().max(120),value:z.number().int().min(0).max(500000)}).strict();
const level=z.object({free:reward,premium:reward}).strict();
export const draftSchema=z.object({lite:plan,plus:plan,battlePass:z.object({stars:z.number().int().min(1).max(100000),visibility:membershipVisibility,season:z.string().trim().min(1).max(80),days:z.number().int().min(1).max(365),levels:z.array(level).length(50)}).strict()}).strict();
export type MonetizationDraft=z.infer<typeof draftSchema>;
export function initialMonetizationDraft():MonetizationDraft {
 return {lite:{stars:249,visibility:'hidden',coins:100,skins:150,title:'DROPSO LITE',description:'Значок подписчика, эксклюзивное оформление профиля и повышенные лимиты передачи.'},plus:{stars:399,visibility:'hidden',coins:200,skins:300,title:'DROPSO PLUS',description:'Преимущества LITE, анимированная рамка, расширенная статистика и оформление клана.'},battlePass:{stars:499,visibility:'hidden',season:'NIGHT SHIFT · Season 2',days:90,levels:seasonTwoRewardDraft()}};
}

export function installMonetizationDraft(app:Express,db:SupabaseClient,admin:RequestHandler,origin:string){
 installMembershipPage(app,admin);
 installPlayerMembershipPreview(app,admin);
 installS2Design(app,db,admin);
 installMonetizationReadiness(app,admin);
 installStarsPilot(app,db,admin);
 installStarsPlusPerks(app,db,admin);
 installLiveSeason(app,db,admin,origin);
 installSeasonSetup(app,db,admin,origin,value=>{const parsed=draftSchema.safeParse(value);return parsed.success?parsed.data:value&&Object.keys(value as object).length?null:initialMonetizationDraft()});
 installSeasonTaskPreview(app,admin);
 installSeasonTest(app,db,admin,origin);
 installRealSeason(app,db,admin,origin);
 installTestMembership(app,db,admin,origin,value=>{const parsed=draftSchema.safeParse(value);return parsed.success?parsed.data:value&&Object.keys(value as object).length?null:initialMonetizationDraft()});
 const noStore:RequestHandler=(_q,r,next)=>{r.set('Cache-Control','private, no-store');next()};
 app.get('/admin/monetization',noStore,admin,(_q,r)=>r.type('html').send(monetizationHtml.replace('<h1>','<p><a href="/admin/monetization/player-preview">Подписки · вид игрока ↗</a> · <a href="/admin/monetization/readiness">Готовность запуска ↗</a> · <a href="/admin/monetization/membership-page">DROPSO MEMBERSHIP · Предпросмотр ↗</a> · <a href="/admin/monetization/s2-design">NIGHT SHIFT S2 · Дизайн-превью ↗</a> · <a href="/admin/monetization/s2-real">NIGHT SHIFT S2 · Battle Pass с реальным прогрессом (ADMIN TEST) ↗</a> · <a href="/admin/monetization/stars">Telegram Stars · ADMIN TEST ↗</a> · <a href="/admin/monetization/cosmetics">Подписочная косметика ↗</a> · <a href="/admin/monetization/plus/statistics">Статистика PLUS ↗</a> · <a href="/admin/monetization/s2-live">S2 · Реальный сезон (закрыт) ↗</a> · <a href="/admin/monetization/s2-setup">Настройка S2 · награды и даты ↗</a> · <a href="/admin/monetization/s2-cosmetics">Коллекция S2 ↗</a></p><h1>')));
 app.get('/admin/monetization/premium',noStore,admin,(_q,r)=>r.type('html').send(premiumPreviewHtml.replace('<main>','<main><p><a href="/admin/monetization/membership">Проверка прав и лимитов подписки (ADMIN TEST) ↗</a></p>')));
 app.get('/api/admin/monetization/premium-script',noStore,admin,(_q,r)=>r.type('application/javascript').send(premiumPreviewJs));
 app.get('/api/admin/monetization/script',noStore,admin,(_q,r)=>r.type('application/javascript').send(monetizationJs));
 app.get('/api/admin/monetization/access',noStore,admin,(_q,r)=>r.json({allowed:true}));
 app.get('/api/admin/monetization/telegram',noStore,admin,async(_q,r)=>{
  const actor=r.locals.session.twitchUserId;
  const {data:user,error}=await db.from('rewards_users').select('id').eq('twitch_user_id',actor).maybeSingle();
  if(error)return void r.status(503).json({error:'telegram_link_unavailable'});
  let linked=false;
  if(user){const {data,error:linkError}=await db.from('rewards_bonus_telegram_links').select('telegram_id').eq('user_id',user.id).maybeSingle();if(linkError)return void r.status(503).json({error:'telegram_link_unavailable'});linked=Boolean(data?.telegram_id)}
  const relay=Boolean(process.env.BONUS_TELEGRAM_RELAY_SECRET&&process.env.BONUS_TELEGRAM_BOT_USERNAME),direct=Boolean(process.env.BONUS_TELEGRAM_BOT_TOKEN&&process.env.BONUS_TELEGRAM_WEBHOOK_SECRET&&process.env.BONUS_TELEGRAM_BOT_USERNAME);
  r.json({linked,configured:relay||direct,mode:relay?'relay':direct?'direct':'none',livePayments:false});
 });
 app.get('/api/admin/monetization/draft',noStore,admin,async(_q,r)=>{
  const {data,error}=await db.from('rewards_monetization_draft').select('revision,config,updated_at').eq('id',true).single();
  if(error||!data)return void r.status(503).json({error:'draft_unavailable'});
  const parsed=draftSchema.safeParse(data.config);
  if(!parsed.success&&Object.keys(data.config||{}).length)return void r.status(503).json({error:'invalid_saved_draft'});
  const config=parsed.success?parsed.data:initialMonetizationDraft();
  // Old blank drafts get the proposal in preview, but saved administrator edits are never overwritten.
  if(config.battlePass.levels.every(x=>x.free.kind==='none'&&x.premium.kind==='none'))config.battlePass.levels=seasonTwoRewardDraft();
  r.json({revision:data.revision,config,updatedAt:data.updated_at,seasonTwo:{rules:seasonTwoRules,thresholds:seasonTwoThresholds,rewards:seasonTwoRewardDraft()},livePayments:false});
 });
 app.put('/api/admin/monetization/draft',noStore,admin,async(q,r)=>{
  if(q.get('origin')!==origin||!q.is('application/json'))return void r.sendStatus(403);
  const input=z.object({revision:z.number().int().min(0).max(2147483646),config:draftSchema}).strict().safeParse(q.body);
  if(!input.success)return void r.status(400).json({error:'invalid_draft'});
  const {revision,config}=input.data;
  const {data,error}=await db.from('rewards_monetization_draft').update({revision:revision+1,config,updated_by:r.locals.session.twitchUserId,updated_at:new Date().toISOString()}).eq('id',true).eq('revision',revision).select('revision').maybeSingle();
  if(error)return void r.status(503).json({error:'draft_unavailable'});
  if(!data)return void r.status(409).json({error:'draft_conflict'});
  r.json({revision:data.revision,livePayments:false});
 });
}
