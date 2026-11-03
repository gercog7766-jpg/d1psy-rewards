import express from 'express';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL=process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co';
const SUPABASE_SECRET_KEY=process.env.SUPABASE_SECRET_KEY||'not-configured';
const db=createClient(SUPABASE_URL,SUPABASE_SECRET_KEY,{auth:{persistSession:false}});

export function installObsHotfix(){
  const proto:any=(express as any).application;
  const originalGet=proto.get;
  const activityInstalled=new WeakSet<object>();
  const activityHandler=async(_req:any,res:any)=>{
    try{
      const {data:win,error}=await db.from('rewards_wins').select('id,won_at,source_type,user_id,prize_id').order('won_at',{ascending:false}).limit(1).maybeSingle();
      if(error) throw error;
      if(!win){res.set('Cache-Control','no-store');return res.json({activity:null})}
      const [{data:user,error:userError},{data:prize,error:prizeError}]=await Promise.all([
        db.from('rewards_users').select('twitch_display_name').eq('id',win.user_id).maybeSingle(),
        db.from('rewards_prizes').select('name,image_url').eq('id',win.prize_id).maybeSingle()
      ]);
      if(userError) console.error('obs_activity_user_failed',userError);
      if(prizeError) console.error('obs_activity_prize_failed',prizeError);
      res.set('Cache-Control','no-store');
      res.json({activity:{...win,rewards_users:user||null,rewards_prizes:prize||null}});
    }catch(e){console.error('obs_activity_failed',e);res.set('Cache-Control','no-store');res.json({activity:null})}
  };
  proto.get=function(path:any,...handlers:any[]){
    if(!activityInstalled.has(this)){
      activityInstalled.add(this);
      originalGet.call(this,'/api/public/activity',activityHandler);
    }
    if(path==='/obs') return originalGet.call(this,path,(_req:any,res:any)=>res.send(obsHtml()));
    if(path==='/api/public/activity') return originalGet.call(this,path,activityHandler);
    return originalGet.call(this,path,...handlers);
  };
}

function obsHtml(){return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent;font-family:Arial,"Segoe UI",system-ui,sans-serif;color:#fff;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}.wrap{height:100%;display:flex;align-items:center;justify-content:center;padding:12px}.box{position:relative;width:290px;max-width:calc(100vw - 24px);min-height:86px;overflow:hidden;background:linear-gradient(135deg,rgba(12,8,20,.97),rgba(30,13,43,.96));border:1px solid rgba(196,103,255,.55);border-radius:14px;padding:12px 14px 13px;box-shadow:0 8px 24px rgba(0,0,0,.48),0 0 16px rgba(218,70,190,.12);transform:rotate(-2.5deg);transform-origin:center center}.box:before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 15% 0,rgba(139,92,246,.14),transparent 45%),radial-gradient(circle at 90% 100%,rgba(236,72,153,.12),transparent 42%)}.brand,.round,.activity{position:relative}.brand{font-size:11px;font-weight:700;letter-spacing:.035em;margin-bottom:8px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.55)}.brand span{font-weight:800;background:linear-gradient(90deg,#b89cff,#ff68b4);-webkit-background-clip:text;background-clip:text;color:transparent}.roundTop{display:flex;align-items:center;justify-content:space-between;gap:10px}.roundTitle{font-size:13px;font-weight:700;color:#fff;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.55)}.main{font-size:14px;font-weight:800;color:#fff;text-align:right;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.6)}.sub{font-size:11px;font-weight:500;color:#d4c9df;margin-top:2px;letter-spacing:.01em}.bar{height:9px;margin-top:8px;padding:2px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.08);border-radius:5px;overflow:hidden}.fill{height:100%;width:0;border-radius:3px;background:linear-gradient(90deg,#8b5cf6,#c64ee8,#ec4899);box-shadow:0 0 8px rgba(214,72,199,.45);transition:width .45s linear}.activity{display:none}.activity.show{display:grid;grid-template-columns:64px minmax(0,1fr);grid-template-rows:auto auto auto;column-gap:11px;align-items:center;animation:pop .28s ease-out}.round.hidden{display:none}.activityImg{display:none;grid-column:1;grid-row:1/4;width:64px;height:58px;object-fit:contain;filter:drop-shadow(0 5px 8px rgba(0,0,0,.5))}.activityImg.on{display:block}.tag{grid-column:2;font-size:10px;font-weight:800;letter-spacing:.045em;text-transform:uppercase;background:linear-gradient(90deg,#b89cff,#ff68b4);-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:2px}.activityName{grid-column:2;font-size:17px;font-weight:800;line-height:1.05;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.55)}.activityPrize{grid-column:2;font-size:11px;font-weight:500;color:#e2d9e8;margin-top:4px;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}@keyframes pop{from{opacity:0;transform:translateY(3px) scale(.98)}to{opacity:1;transform:none}}@media(max-width:330px){.box{width:280px}.activity{grid-template-columns:56px minmax(0,1fr)}.activityImg{width:56px;height:52px}.activityName{font-size:16px}}
</style></head><body><div class="wrap"><div class="box"><div class="brand">Забирай дроп на <span>D1PSY Rewards</span></div><div id="round" class="round"><div class="roundTop"><div><div id="roundTitle" class="roundTitle">До следующего дропа</div><div id="sub" class="sub">Подключение...</div></div><div id="main" class="main">—</div></div><div class="bar"><div id="fill" class="fill"></div></div></div><div id="activity" class="activity"><img id="activityImg" class="activityImg" alt=""><div id="activityTag" class="tag">ДРОП ЗАБРАЛ</div><div id="activityName" class="activityName">—</div><div id="activityPrize" class="activityPrize">—</div></div></div></div><script>
let lastActivityId=null,hideActivityAt=0;
function labelFor(type){if(type==='upgrader')return 'АПГРЕЙД ЗАШЁЛ';if(type==='shop')return 'ЗАБРАЛ В МАГАЗИНЕ';return 'ДРОП ЗАБРАЛ'}
function showActivity(w){if(!w||!w.id||w.id===lastActivityId)return;lastActivityId=w.id;activityTag.textContent=labelFor(w.source_type);activityName.textContent=w.rewards_users?.twitch_display_name||'Игрок';activityPrize.textContent=w.rewards_prizes?.name||'Предмет';const src=w.rewards_prizes?.image_url||'';activityImg.src=src;activityImg.classList.toggle('on',!!src);activity.classList.add('show');round.classList.add('hidden');hideActivityAt=Date.now()+7000}
async function tick(){try{const stateRes=await fetch('/api/public/state',{cache:'no-store'});if(!stateRes.ok)throw new Error('state_'+stateRes.status);const s=await stateRes.json();fetch('/api/public/activity',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(a=>{const item=a?.activity;if(item&&Date.now()-new Date(item.won_at).getTime()<15000)showActivity(item)}).catch(()=>{});if(hideActivityAt&&Date.now()>=hideActivityAt){activity.classList.remove('show');round.classList.remove('hidden');hideActivityAt=0}if(s.twitchConnectionStatus!=='connected'){roundTitle.textContent='D1PSY Rewards';main.textContent='OFFLINE';sub.textContent='Twitch не подключён';fill.style.width='0%'}else if(s.round){if(s.round.mode==='messages'){const count=Number(s.round.message_count)||0,total=Math.max(1,Number(s.round.message_threshold)||1),left=Math.max(0,total-count),pct=Math.max(0,Math.min(100,count/total*100));roundTitle.textContent='До дропа';main.textContent=left+' сообщ.';sub.textContent=count+' из '+total+' сообщений';fill.style.width=pct+'%'}else{const total=Math.max(1,Number(s.round.interval_seconds)||1),end=new Date(s.round.started_at).getTime()+total*1000,left=Math.max(0,Math.ceil((end-Date.now())/1000)),m=Math.floor(left/60),sec=String(left%60).padStart(2,'0'),pct=Math.max(0,Math.min(100,(total-left)/total*100));roundTitle.textContent='До дропа';main.textContent=m+' м. '+sec+' с.';sub.textContent='Следующий дроп уже близко';fill.style.width=pct+'%'}}else{roundTitle.textContent='D1PSY Rewards';main.textContent=s.enabled?'СКОРО':'СТОП';sub.textContent=s.enabled?'Готовим следующий дроп':'Дропы остановлены';fill.style.width='0%'}}catch{roundTitle.textContent='D1PSY Rewards';main.textContent='ERROR';sub.textContent='Нет связи с сервером';fill.style.width='0%'}}tick();setInterval(tick,500);
</script></body></html>`}
