import crypto from 'node:crypto';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});

function session(req:any){
 try{
  const secret=process.env.SESSION_SECRET||'',raw=req.cookies?.rewards_session;
  if(!raw||!secret)return null;
  const [p,s]=raw.split('.'); if(!p||!s)return null;
  const expected=crypto.createHmac('sha256',secret).update(p).digest('base64url');
  if(Buffer.byteLength(s)!==Buffer.byteLength(expected)||!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(expected)))return null;
  const v=JSON.parse(Buffer.from(p,'base64url').toString()); return v.exp>Date.now()?v:null;
 }catch{return null}
}
function levelFor(x:number){return Math.max(1,Math.floor((Math.sqrt(9+8*Math.max(0,x)/75)-3)/2)+1)}
function threshold(level:number){return Math.round(37.5*(level-1)*(level+2))}

const SCRIPT=`<script id="levelRuntimeFix">(function(){
async function refreshLevel(){
 var badge=document.getElementById('levelBadge'),text=document.getElementById('levelText'),fill=document.getElementById('levelFill');
 if(!badge||!text||!fill)return;
 try{
  var r=await fetch('/api/me/level-v2?ts='+Date.now(),{cache:'no-store',credentials:'same-origin'});
  if(!r.ok)throw new Error('level_http_'+r.status);
  var x=await r.json();
  badge.textContent='LVL '+x.level;
  text.textContent=x.levelXp+' / '+x.nextXp+' XP';
  fill.style.width=Math.max(0,Math.min(100,x.nextXp?x.levelXp/x.nextXp*100:100))+'%';
  var stats=document.getElementById('levelModalStats');if(stats)stats.textContent='Уровень '+x.level+' · '+x.xp+' XP · до следующего '+x.remaining+' XP';
 }catch(e){text.textContent='Ошибка загрузки XP';console.error('level_runtime_load_failed',e)}
}
function bindLevelUi(){
 var w=document.getElementById('levelWidget'),m=document.getElementById('levelModal'),c=document.getElementById('levelClose');
 if(w&&!w.dataset.runtimeClick){w.dataset.runtimeClick='1';w.addEventListener('click',function(){var mm=document.getElementById('levelModal');if(mm)mm.style.display='flex'})}
 if(c&&!c.dataset.runtimeClick){c.dataset.runtimeClick='1';c.addEventListener('click',function(e){e.stopPropagation();var mm=document.getElementById('levelModal');if(mm)mm.style.display='none'})}
 if(m&&!m.dataset.runtimeClick){m.dataset.runtimeClick='1';m.addEventListener('click',function(e){if(e.target===m)m.style.display='none'})}
}
function boot(){bindLevelUi();refreshLevel()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.addEventListener('focus',function(){bindLevelUi();refreshLevel()});
})();</script>`;

export function installAccountLevelRuntimeFixHotfix(){
 const proto:any=(express as any).application,response:any=(express as any).response;
 if(response.__accountLevelRuntimeFix)return; response.__accountLevelRuntimeFix=true;
 const originalSend=response.send,originalListen=proto.listen;
 response.send=function(body:any){
  const req:any=(this as any).req;
  if(typeof body==='string'&&req?.path==='/account'&&body.includes('id="levelWidget"')&&!body.includes('levelRuntimeFix'))body=body.replace('</body>',SCRIPT+'</body>');
  return originalSend.call(this,body);
 };
 proto.listen=function(...args:any[]){
  const app:any=this;
  if(!app.locals.__accountLevelRuntimeFixRoutes){app.locals.__accountLevelRuntimeFixRoutes=true;
   app.get('/api/me/level-v2',async(req:any,res:any)=>{
    const s=session(req);if(!s)return res.status(401).json({error:'authentication_required'});
    const {data:u,error}=await db.from('rewards_users').select('id,xp_total').eq('twitch_user_id',String(s.twitchUserId)).maybeSingle();
    if(error)return res.status(500).json({error:'level_user_lookup_failed'});if(!u)return res.status(404).json({error:'user_not_found'});
    const xp=Math.max(0,Number(u.xp_total||0)),level=levelFor(xp),from=threshold(level),to=threshold(level+1);
    res.set('Cache-Control','no-store, no-cache, must-revalidate');
    return res.json({xp,level,levelXp:xp-from,nextXp:to-from,remaining:Math.max(0,to-xp)});
   });
  }
  return originalListen.apply(this,args);
 };
}
