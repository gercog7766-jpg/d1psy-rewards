import express from 'express';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL=process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co';
const SUPABASE_SECRET_KEY=process.env.SUPABASE_SECRET_KEY||'not-configured';
const db=createClient(SUPABASE_URL,SUPABASE_SECRET_KEY,{auth:{persistSession:false}});

export function installObsHotfix(){
  const proto:any=(express as any).application;
  const originalGet=proto.get;
  proto.get=function(path:any,...handlers:any[]){
    if(path==='/obs') return originalGet.call(this,path,(_req:any,res:any)=>res.send(obsHtml()));
    if(path==='/api/public/activity') return originalGet.call(this,path,async(_req:any,res:any)=>{
      try{
        const {data:win,error}=await db.from('rewards_wins').select('id,won_at,source_type,user_id,prize_id').order('won_at',{ascending:false}).limit(1).maybeSingle();
        if(error) throw error;
        if(!win){res.set('Cache-Control','no-store');return res.json({activity:null})}
        const [{data:user},{data:prize}]=await Promise.all([
          db.from('rewards_users').select('twitch_display_name').eq('id',win.user_id).maybeSingle(),
          db.from('rewards_prizes').select('name,image_url').eq('id',win.prize_id).maybeSingle()
        ]);
        res.set('Cache-Control','no-store');
        res.json({activity:{...win,rewards_users:user||null,rewards_prizes:prize||null}});
      }catch(e){console.error('obs_activity_failed',e);res.set('Cache-Control','no-store');res.json({activity:null})}
    });
    return originalGet.call(this,path,...handlers);
  };
}

function obsHtml(){return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent;font-family:Inter,Arial,system-ui,sans-serif;color:#fff}.wrap{height:100%;display:flex;align-items:center;justify-content:center;padding:18px}.box{position:relative;width:430px;max-width:calc(100vw - 36px);overflow:hidden;background:linear-gradient(145deg,rgba(9,7,15,.96),rgba(25,12,38,.95));border:1px solid rgba(168,85,247,.72);border-radius:18px;padding:17px 24px 19px;text-align:center;box-shadow:0 10px 28px rgba(0,0,0,.48),0 0 18px rgba(139,92,246,.12);backdrop-filter:blur(8px)}.box:before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% -20%,rgba(168,85,247,.15),transparent 58%)}.brand,.round,.activity{position:relative}.brand{font-size:11px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:#bca7e8;opacity:.9}.prize{font-size:18px;font-weight:750;line-height:1.22;letter-spacing:-.01em;margin:8px auto 0;color:#f4f0fb;max-width:350px}.main{font-size:42px;font-weight:900;letter-spacing:-.045em;line-height:1;margin-top:8px}.sub{font-size:13px;font-weight:550;color:#cbb9e8;margin-top:8px}.activity{display:none}.activity.show{display:grid;grid-template-columns:92px minmax(0,1fr);grid-template-rows:auto auto auto;column-gap:15px;align-items:center;text-align:left;margin-top:10px;animation:pop .35s cubic-bezier(.2,.8,.2,1)}.round.hidden{display:none}.tag{grid-column:2;font-size:10px;font-weight:850;color:#bca7e8;text-transform:uppercase;letter-spacing:.16em;margin-bottom:2px}.activityName{grid-column:2;font-size:24px;font-weight:900;letter-spacing:-.025em;line-height:1.05;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.activityImg{display:none;grid-column:1;grid-row:1/4;width:92px;height:78px;object-fit:contain;margin:0;filter:drop-shadow(0 8px 12px rgba(0,0,0,.45))}.activityImg.on{display:block}.activity .prize{grid-column:2;font-size:15px;margin:5px 0 0;max-width:100%;color:#e8e1f2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}@keyframes pop{0%{opacity:0;transform:translateY(5px) scale(.97)}100%{opacity:1;transform:none}}@media(max-width:500px){.box{width:390px;padding:15px 19px 17px}.main{font-size:37px}.activity.show{grid-template-columns:78px minmax(0,1fr);column-gap:12px}.activityImg{width:78px;height:68px}.activityName{font-size:21px}}
</style></head><body><div class="wrap"><div class="box"><div class="brand">D1PSY LIVE</div><div id="round" class="round"><div id="prize" class="prize">ДРОП</div><div id="main" class="main">—</div><div id="sub" class="sub">Подключение…</div></div><div id="activity" class="activity"><img id="activityImg" class="activityImg" alt=""><div id="activityTag" class="tag">ДРОП ЗАБРАЛ</div><div id="activityName" class="activityName">—</div><div id="activityPrize" class="prize">—</div></div></div></div><script>
let lastActivityId=null,hideActivityAt=0;
function labelFor(type){if(type==='upgrader')return 'АПГРЕЙД ЗАШЁЛ';if(type==='shop')return 'ЗАБРАЛ В МАГАЗИНЕ';return 'ДРОП ЗАБРАЛ'}
function showActivity(w){if(!w||!w.id||w.id===lastActivityId)return;lastActivityId=w.id;activityTag.textContent=labelFor(w.source_type);activityName.textContent=w.rewards_users?.twitch_display_name||'Игрок';activityPrize.textContent=w.rewards_prizes?.name||'Предмет';const src=w.rewards_prizes?.image_url||'';activityImg.src=src;activityImg.classList.toggle('on',!!src);activity.classList.add('show');round.classList.add('hidden');hideActivityAt=Date.now()+7000}
async function tick(){try{const stateRes=await fetch('/api/public/state',{cache:'no-store'});if(!stateRes.ok)throw new Error('state_'+stateRes.status);const s=await stateRes.json();fetch('/api/public/activity',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(a=>{const item=a?.activity;if(item&&Date.now()-new Date(item.won_at).getTime()<15000)showActivity(item)}).catch(()=>{});if(hideActivityAt&&Date.now()>=hideActivityAt){activity.classList.remove('show');round.classList.remove('hidden');hideActivityAt=0}if(s.twitchConnectionStatus!=='connected'){main.textContent='OFFLINE';sub.textContent='Twitch не подключён';prize.textContent='ДРОП'}else if(s.round){prize.textContent='ДРОП';if(s.round.mode==='messages'){main.textContent=s.round.message_count+' / '+s.round.message_threshold;sub.textContent='сообщений до дропа'}else{const end=new Date(s.round.started_at).getTime()+s.round.interval_seconds*1000,left=Math.max(0,Math.ceil((end-Date.now())/1000)),m=Math.floor(left/60),sec=String(left%60).padStart(2,'0');main.textContent=m+':'+sec;sub.textContent='до следующего дропа'}}else{prize.textContent='ДРОП';main.textContent=s.enabled?'СКОРО':'СТОП';sub.textContent=s.enabled?'Готовим следующий дроп':'Дропы остановлены'}}catch{main.textContent='ERROR';sub.textContent='Нет связи с сервером'}}tick();setInterval(tick,500);
</script></body></html>`}
