import crypto from 'node:crypto';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
const START=Date.parse('2026-11-01T21:00:00.000Z');
const END=Date.parse('2026-12-12T21:00:00.000Z');
const SEASON='s1';
const LEVEL_COSTS=[0,500,500,500,500,750,750,750,750,750,750,1000,1000,1000,1000,1000,1250,1250,1250,1250,1250,1250,1250,1250,1250,1250,1250,1250,1250,1250,1250,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,2000,2000,2000,2000,2000,2000,2000,2000,2000];
const rewards=Array.from({length:50},(_,i)=>{const l=i+1;if(l<=2)return {level:l,type:'coins',label:'5 монет'};if(l<=4)return {level:l,type:'coins',label:'7 монет'};if(l<=10)return {level:l,type:'coins',label:'10 монет'};if(l<=15)return {level:l,type:'coins',label:'15 монет'};if(l<=20)return {level:l,type:'coins',label:'20 монет'};if(l===21)return {level:l,type:'cosmetic',label:'Уникальный цвет LVL · S1'};if(l===22)return {level:l,type:'xp',label:'300 XP'};if(l===23)return {level:l,type:'cosmetic',label:'Эксклюзивная рамка S1'};if(l===24)return {level:l,type:'item',label:'Наклейка | Бицепс'};if(l<=30)return {level:l,type:'coins',label:'30 монет'};if(l<=40)return {level:l,type:'coins',label:'50 монет'};if(l<50)return {level:l,type:'coins',label:'80 монет'};return {level:l,type:'final',label:'S1 Badge + AWP | Экзотермия'}});
const daily=[['drop_win','Выиграй дроп на стриме',1,100],['daily_bonus','Забери бонус дня',1,100],['upgrades_2','Сделай 2 апгрейда',2,150],['shop_buy','Купи предмет в магазине',1,150],['xp_100','Получи 100 XP за день',100,150],['withdraw_30','Выведи скин стоимостью 30+ монет',1,150],['upgrade_win','Сделай успешный апгрейд',1,200]] as any[];
const weekly=[['upgrades_15','Сделай 15 апгрейдов',15,700],['withdraw_200','Выведи скин стоимостью 200+ монет',1,600],['upgrader_coins_200','Потрать суммарно 200+ монет в апгрейдере',200,600],['xp_500','Получи 500 XP',500,500],['upgrade_30','Выиграй апгрейд с шансом ≤30%',1,1000],['daily_all','Забери все ежедневные бонусы недели',7,1000],['streak_5','Выиграй 5 апгрейдов подряд',5,1500],['drops_10','Выиграй 10 дропов на стриме',10,600],['upgrade_x3','Сделай успешный апгрейд ×3 или выше',1,800],['upgrade_value_3000','Получи через успешные апгрейды предметов на 3000+ монет',3000,800]] as any[];
const challenges=[['allin','Ва-банк · выиграй апгрейд ×5+',1,1500],['sniper','Снайпер · выиграй апгрейд с шансом ≤15%',1,2000],['closecall','На волоске · выиграй апгрейд с шансом ≤10%',1,3000]] as any[];
function session(req:any){try{const secret=process.env.SESSION_SECRET||'',raw=req.cookies?.rewards_session;if(!raw||!secret)return null;const [p,s]=raw.split('.'),e=crypto.createHmac('sha256',secret).update(p).digest('base64url');if(!s||s.length!==e.length||!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(e)))return null;const v=JSON.parse(Buffer.from(p,'base64url').toString());return v.exp>Date.now()?v:null}catch{return null}}
function dayKey(now=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now))}
function weekKey(now=Date.now()){const d=new Date(now+3*3600000),start=new Date(START+3*3600000);return 'W'+Math.max(1,Math.floor((d.getTime()-start.getTime())/604800000)+1)}
function bp(sp:number){let level=1,spent=0;for(let l=1;l<50;l++){const c=LEVEL_COSTS[l]||2000;if(sp<spent+c)return {level,into:sp-spent,next:c};spent+=c;level=l+1}return {level:50,into:0,next:0}}
function pickDaily(key:string){let h=0;for(const c of key)h=(h*31+c.charCodeAt(0))>>>0;const isSunday=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',weekday:'short'}).format(new Date())==='Sun';const a=[...daily].filter(x=>!isSunday||x[0]!=='drop_win');for(let i=a.length-1;i>0;i--){h=(h*1664525+1013904223)>>>0;const j=h%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a.slice(0,3)}

export function installSeasonAuthFixHotfix(){
  const proto:any=(express as any).application,ol=proto.listen;
  proto.listen=function(...args:any[]){
    const app:any=this;
    if(!app.locals.__seasonAuthFix){
      app.locals.__seasonAuthFix=true;
      app.get('/api/me/season',async(req:any,res:any)=>{
        const s=session(req);if(!s)return res.status(401).json({error:'authentication_required'});
        const {data:u,error:uErr}=await db.from('rewards_users').select('id,twitch_login,twitch_display_name').eq('twitch_user_id',s.twitchUserId).maybeSingle();
        if(uErr){console.error('season_user_lookup_failed',uErr);return res.status(500).json({error:'season_user_lookup_failed'})}
        if(!u)return res.status(401).json({error:'authentication_required'});
        const {data:p,error:pErr}=await db.from('rewards_season_progress').select('sp,claimed_levels').eq('user_id',u.id).eq('season_id',SEASON).maybeSingle();
        if(pErr)return res.status(500).json({error:'season_progress_failed'});
        const sp=Number(p?.sp||0),b=bp(sp),now=Date.now(),dk=dayKey(now),wk=weekKey(now),periods=[dk,wk,'season'];
        const {data:rows,error:rErr}=await db.from('rewards_season_task_progress').select('task_key,period_key,progress,completed_at').eq('user_id',u.id).eq('season_id',SEASON).in('period_key',periods);
        if(rErr)return res.status(500).json({error:'season_tasks_failed'});
        const m=new Map((rows||[]).map((r:any)=>[r.task_key+'|'+r.period_key,r]));
        const map=(a:any[],period:string)=>a.map(x=>{const r:any=m.get(x[0]+'|'+period),done=!!r?.completed_at;return {key:x[0],title:x[1],target:x[2],reward:x[3],progress:Math.min(x[2],Number(r?.progress||0)),complete:done,done}});
        res.set('Cache-Control','no-store');
        return res.json({season:SEASON,name:'NIGHT SHIFT',start:new Date(START).toISOString(),end:new Date(END).toISOString(),status:now<START?'upcoming':now>=END?'ended':'active',sp,...b,dailyKey:dk,weekKey:wk,rewards:rewards.map(x=>({...x,unlocked:b.level>=x.level,label:b.level>=x.level?x.label:null})),daily:map(pickDaily(dk),dk),weekly:map(weekly,wk),challenges:map(challenges,'season')});
      });
    }
    return ol.apply(this,args);
  };
}
