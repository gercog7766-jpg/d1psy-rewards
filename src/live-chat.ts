import type {Express,RequestHandler} from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';

const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function installLiveChat(app:Express,db:SupabaseClient,user:RequestHandler,origin:string,admin?:RequestHandler){
  app.get('/live-chat.js',(_q,r)=>r.type('application/javascript').set('Cache-Control','no-cache').send(chatScript));
  app.get('/live-chat.css',(_q,r)=>r.type('text/css').set('Cache-Control','no-cache').send(chatCss));
  if(admin){
    app.get('/api/me/live-chat/moderation',admin,(_q,r)=>r.set('Cache-Control','no-store').sendStatus(204));
    app.get('/api/admin/live-chat',admin,async(q,r)=>{
      r.set('Cache-Control','no-store');
      const room=q.query.room;
      if(typeof room!=='string'||!uuid.test(room))return r.sendStatus(400);
      const {data,error}=await db.from('rewards_live_chat').select('id:id::text,nick,message,at:created_at')
        .eq('room_id',room).gt('created_at',new Date(Date.now()-7_200_000).toISOString())
        .order('id',{ascending:false}).limit(100);
      if(error)return r.sendStatus(503);
      return r.json(data.reverse());
    });
    app.delete('/api/admin/live-chat/:id',admin,async(q,r)=>{
      r.set('Cache-Control','no-store');
      if(q.get('origin')!==origin)return r.sendStatus(403);
      const id=q.params.id;
      if(typeof id!=='string'||!/^[1-9][0-9]{0,18}$/.test(id)||BigInt(id)>9223372036854775807n)return r.sendStatus(400);
      const {error}=await db.from('rewards_live_chat').delete().eq('id',id);
      return r.sendStatus(error?503:204);
    });
  }
  app.all('/api/me/live-chat',user,async(q,r)=>{
    r.set('Cache-Control','no-store');
    if(q.method!=='GET'&&q.method!=='POST')return r.sendStatus(405);
    const room=q.query.room;
    if(room!==undefined&&(typeof room!=='string'||!uuid.test(room)))return r.sendStatus(400);
    let message=null;
    if(q.method==='POST'){
      if(q.get('origin')!==origin||!q.is('application/json'))return r.sendStatus(403);
      message=q.body?.message;
      if(typeof message!=='string'||Array.from(message.trim()).length<1||Array.from(message).length>140)return r.sendStatus(400);
    }
    const {data,error}=await db.rpc('rewards_live_chat_feed',{p_actor:r.locals.session.twitchUserId,p_room:room??null,p_message:message});
    if(error)return r.status(error.message==='chat_rate_limit'?429:error.message==='chat_unavailable'?403:error.message==='invalid_message'?400:503).json({error:error.message==='chat_rate_limit'?'slow_down':'chat_unavailable'});
    return r.json(data);
  });
}

const chatCss=`
.dropso-live-chat{padding:16px;border:1px solid #593579;border-radius:16px;background:#171022;margin-block:14px;color:#f7edff}
.dropso-live-chat h2{margin:0 0 10px;font-size:18px}.dropso-live-chat ol{height:clamp(180px,42dvh,420px);overflow:auto;padding:0;margin:0;list-style:none}
.dropso-live-chat li{padding:8px 4px;border-bottom:1px solid #422b56;overflow-wrap:anywhere}.dropso-live-chat time{font-size:12px;color:#c3a9d6;margin-right:8px}
.dropso-live-chat p{margin:3px 0}.dropso-live-chat form{display:flex;gap:8px;margin-top:10px}.dropso-live-chat input{flex:1;min-width:0;font:inherit;font-size:16px;padding:8px;border:1px solid #68448d;border-radius:9px;background:#0e0a16;color:white}
.dropso-live-chat button,.chat-tabs button{min-height:42px;border-radius:9px;border:1px solid #8151ac;background:#562b83;color:#fff;padding:6px 11px;cursor:pointer}
.dropso-live-chat .chat-delete{margin-left:10px;min-height:32px;padding:2px 9px;font-size:12px;background:#2c193c}
.dropso-live-chat form[hidden]{display:none}
.chat-tabs{display:flex;gap:8px;margin-bottom:12px}.chat-tabs [aria-pressed="true"]{background:#753ab3}
[data-chat-panel][hidden],#communityPrivate[hidden]{display:none!important}
`;

const chatScript=String.raw`
(()=>{
 const panel=document.querySelector('[data-chat-panel]');
 if(!panel)return;
 const list=panel.querySelector('ol'),form=panel.querySelector('form'),input=form.elements.message,status=panel.querySelector('[role=status]');
 const game=panel.dataset.chatPanel==='room', time=new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'});
 let moderator=false;
 const spectator=()=>game&&panel.dataset.chatParticipant!=='true';
 const room=()=>game&&(!spectator()||moderator)?(panel.dataset.room||null):null;
 let version=0,shownRoom=null,reading=false,sending=false,signature='';
 function endpoint(id){return '/api/me/live-chat'+(id?'?room='+encodeURIComponent(id):'')}
 function show(rows){
  const next=String(moderator)+':'+rows.map(row=>row.id).join(',');
  if(signature===next)return;
  signature=next;
  const bottom=list.scrollHeight-list.scrollTop-list.clientHeight<60;
  list.replaceChildren(...rows.map(row=>{
   const li=document.createElement('li'),at=document.createElement('time'),nick=document.createElement('strong'),body=document.createElement('p');
   at.dateTime=row.at;at.textContent=time.format(new Date(row.at));nick.textContent=row.nick;body.textContent=row.message;
   li.append(at,nick);
   if(moderator){
    const remove=document.createElement('button');
    remove.type='button';remove.className='chat-delete';remove.textContent='Удалить';
    remove.setAttribute('aria-label','Удалить сообщение от '+row.nick);
    remove.onclick=async()=>{
     if(remove.disabled)return;
     remove.disabled=true;
     const id=room(),check=version;
     try{
      if(!await window.dropsoConfirm('Удалить сообщение?'))return;
      const response=await fetch('/api/admin/live-chat/'+encodeURIComponent(row.id),{method:'DELETE'});
      if(!response.ok)throw Error();
      if(check===version&&room()===id){li.remove();signature='';void read()}
     }catch{if(check===version&&room()===id)status.textContent='Не удалось удалить сообщение.'}
     finally{remove.disabled=false}
    };
    li.append(remove);
   }
   li.append(body);return li;
  }));
  if(bottom)list.scrollTop=list.scrollHeight;
 }
 async function read(){
  const id=room();
  form.hidden=spectator();
  if(game&&shownRoom!==id){shownRoom=id;version++;signature='';list.replaceChildren();input.value='';status.textContent='';panel.hidden=!id;}
  if(panel.hidden||document.hidden||reading||sending)return;
  const check=version;reading=true;
  try{
   const url=spectator()?'/api/admin/live-chat?room='+encodeURIComponent(id):endpoint(id);
   const r=await fetch(url,{cache:'no-store'});
   if(check!==version||room()!==id)return;
   if(game&&r.status===403){panel.hidden=true;return}
   if(!r.ok)throw Error();
   const rows=await r.json();
   if(check!==version||room()!==id)return;
   status.textContent='';show(rows);
  }catch{if(check===version)status.textContent='Не удалось обновить чат.'}
  finally{reading=false}
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const message=input.value.trim(),id=room();
  if(!message||sending||panel.hidden||(game&&(!id||spectator())))return;
  const check=++version;
  sending=true;form.querySelector('button').disabled=true;
  try{
   const r=await fetch(endpoint(id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message})});
   if(check!==version||room()!==id)return;
   if(!r.ok){status.textContent=r.status===429?'Подожди пару секунд.':'Сообщение не отправилось.';return}
   if(input.value.trim()===message)input.value='';
   const rows=await r.json();
   if(check!==version||room()!==id)return;
   status.textContent='';show(rows);list.scrollTop=list.scrollHeight;
  }catch{if(check===version)status.textContent='Сообщение не отправилось.'}
  finally{sending=false;form.querySelector('button').disabled=false}
 });
 const privateTab=document.getElementById('privateChatTab'),publicTab=document.getElementById('publicChatTab');
 function select(publicChat){
  document.getElementById('communityPrivate').hidden=publicChat;
  panel.hidden=!publicChat;
  privateTab.setAttribute('aria-pressed',String(!publicChat));
  publicTab.setAttribute('aria-pressed',String(publicChat));
  if(publicChat)void read();
 }
 if(publicTab){privateTab.onclick=()=>select(false);publicTab.onclick=()=>select(true)}
 if(game)window.addEventListener('dropso-room-change',()=>{
  void read();
 });
 document.addEventListener('visibilitychange',read);
 void read();setInterval(read,3000);
 fetch('/api/me/live-chat/moderation',{cache:'no-store'}).then(response=>{
  if(response.status===204){moderator=true;void read()}
 }).catch(()=>{});
})();
`;

export const compactTradeStyle = '<style>@media(max-width:650px){body .trade-card,body .profilecard .trade-card{min-height:0!important;padding:9px 12px!important;margin-block:8px!important}body .trade-head{margin-bottom:5px!important;gap:6px!important}body .trade-row{gap:5px!important}body .trade-row input,body .trade-row button{min-height:36px!important;padding:5px 8px!important}body .trade-card .save-state{margin:3px 0 0!important;min-height:0!important}}</style>';
