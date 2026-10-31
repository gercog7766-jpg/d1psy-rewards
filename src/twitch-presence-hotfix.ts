import express from 'express';

let appToken='';
let appTokenExp=0;
const CHANNEL=(process.env.TWITCH_CHANNEL_LOGIN||'d1psy_off').toLowerCase();

async function token(){
  if(appToken&&Date.now()<appTokenExp-60000)return appToken;
  const id=process.env.TWITCH_CLIENT_ID||'';
  const secret=process.env.TWITCH_CLIENT_SECRET||'';
  if(!id||!secret)throw new Error('twitch_not_configured');
  const r=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:id,client_secret:secret,grant_type:'client_credentials'})});
  if(!r.ok)throw new Error('twitch_token_failed_'+r.status);
  const j:any=await r.json(); appToken=String(j.access_token||''); appTokenExp=Date.now()+Number(j.expires_in||3600)*1000; return appToken;
}
async function helix(path:string){const id=process.env.TWITCH_CLIENT_ID||'';const t=await token();const r=await fetch('https://api.twitch.tv/helix/'+path,{headers:{'Client-Id':id,Authorization:'Bearer '+t}});if(!r.ok)throw new Error('twitch_api_'+r.status);return r.json() as Promise<any>}

export function installTwitchPresenceHotfix(){
  const proto:any=(express as any).application, originalListen=proto.listen;
  proto.listen=function(...args:any[]){
    const app:any=this;
    if(!app.locals.__twitchPresence){
      app.locals.__twitchPresence=true;
      app.get('/api/twitch-channel-presence',async(_req:any,res:any)=>{try{const [uj,sj]=await Promise.all([helix('users?login='+encodeURIComponent(CHANNEL)),helix('streams?user_login='+encodeURIComponent(CHANNEL))]);const tu=uj?.data?.[0];const stream=sj?.data?.[0]||null;res.set('Cache-Control','public, max-age=30');res.json({login:CHANNEL,avatarUrl:String(tu?.profile_image_url||''),live:!!stream,viewerCount:Number(stream?.viewer_count||0),channelUrl:'https://www.twitch.tv/'+encodeURIComponent(CHANNEL)})}catch(e){console.error('twitch_channel_presence_failed',e);res.status(502).json({error:'twitch_presence_failed'})}});
    }
    const response:any=(express as any).response, send=response.send;
    if(!response.__twitchPresenceSend){response.__twitchPresenceSend=true;response.send=function(body:any){if(typeof body==='string'&&body.includes('id="who"')&&!body.includes('twitchPresenceMarker'))body=inject(body);return send.call(this,body)}}
    return originalListen.apply(this,args);
  };
}

function inject(b:string){
  b=b.replace('</style>',`.brand-mark{overflow:hidden;padding:0}.brand-channel-avatar{width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block}.channel-presence{display:flex;align-items:center;gap:5px;font-size:10px;color:#8f849b;margin-top:3px}.channel-presence.live{color:#f0a8bd}.channel-dot{width:6px;height:6px;border-radius:50%;background:#5d5368}.channel-presence.live .channel-dot{background:#ef476f;box-shadow:0 0 0 2px rgba(239,71,111,.12)}.channel-link{color:inherit;text-decoration:none}.channel-link:hover{text-decoration:underline}.account-user-hook{display:none!important}\n</style>`);
  b=b.replace('<span class="brand-mark">D1</span>','<span class="brand-mark" id="twitchPresenceMarker"><img id="channelAvatar" class="brand-channel-avatar" alt="d1psy_off" hidden><span id="channelAvatarFallback">D1</span></span>');
  b=b.replace('<div id="who" class="user">Загрузка…</div>','<div id="who" class="user account-user-hook">Загрузка…</div><div><a id="channelLink" class="channel-link user" href="https://www.twitch.tv/d1psy_off" target="_blank" rel="noopener noreferrer">d1psy_off</a><div id="channelPresence" class="channel-presence"><span class="channel-dot"></span><span id="channelPresenceText">Проверяем эфир…</span></div></div>');
  b=b.replace('</body>',`<script>(function(){async function p(){try{var r=await fetch('/api/twitch-channel-presence',{cache:'no-store'});if(!r.ok)return;var j=await r.json(),a=document.getElementById('channelAvatar'),f=document.getElementById('channelAvatarFallback'),s=document.getElementById('channelPresence'),t=document.getElementById('channelPresenceText'),l=document.getElementById('channelLink');if(j.avatarUrl&&a){a.src=j.avatarUrl;a.hidden=false;if(f)f.style.display='none'}if(l&&j.channelUrl)l.href=j.channelUrl;if(s&&t){if(j.live){s.classList.add('live');t.textContent='В эфире'+(j.viewerCount?' · '+j.viewerCount+' зр.':'')}else{s.classList.remove('live');t.textContent='Сейчас не в эфире'}}}catch(e){}}p();setInterval(p,60000)})();</script></body>`);return b;
}
