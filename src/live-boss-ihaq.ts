import {io} from 'socket.io-client';
import type {SupabaseClient} from '@supabase/supabase-js';
import {donationCode} from './live-boss-events.js';

const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
type State='not_configured'|'connecting'|'connected'|'disconnected'|'invalid_token';
let status:State='not_configured';
let lastEventAt:string|null=null;
let activeSocket:ReturnType<typeof io>|null=null;
export function bossIhaqStatus(){return {status,lastEventAt}}
export function reconnectBossIhaq(){if(!activeSocket)return false;activeSocket.disconnect();status='connecting';activeSocket.connect();return true}
export function normalizeIhaqEvent(data:unknown,at=new Date().toISOString()){
 if(!data||typeof data!=='object')return null;
 const event=data as Record<string,any>,row=event.message;
 if(event.type!=='donation'||!row||typeof row!=='object'||!uuid.test(String(row.id||''))||String(row.currency||'').toLowerCase()!=='rub'||row.isTest===true||row.is_test===true||row.isTest===1||row.is_test===1)return null;
 if(typeof row.amount!=='string'&&typeof row.amount!=='number'||!/^\d{1,8}(?:\.\d{1,2})?$/.test(String(row.amount)))return null;
 const amount=Number(row.amount);if(!Number.isFinite(amount)||amount<0.5||amount>10000000)return null;
 return {p_event:String(row.id).toLowerCase(),p_donor:typeof row.donatorName==='string'?row.donatorName.slice(0,100):'',p_rub:amount,p_code:donationCode(row.message),p_at:at};
}
// Do not log the socket URL, raw provider payload, token or donor message.
export function startBossIhaq(db:SupabaseClient,apiToken=process.env.BOSS_IHAQ_API_TOKEN||'',connect=io){
 if(!apiToken){status='not_configured';return}
 if(!uuid.test(apiToken)){status='invalid_token';console.error('live_boss_ihaq_invalid_token');return}
 status='connecting';
 const socket=connect('wss://ihaqdonate.com',{path:'/ws/integrations/socket.io/v1/'+apiToken,transports:['polling','websocket'],reconnection:true,reconnectionDelay:1000,reconnectionDelayMax:30000,timeout:10000,autoConnect:false});
 activeSocket=socket;
 let queue=Promise.resolve(),pending=0;
 socket.on('connect',()=>{status='connected';console.info('live_boss_ihaq_connected')});
 socket.on('disconnect',()=>{status='disconnected'});
 socket.on('connect_error',()=>{if(status!=='disconnected'){status='disconnected';console.warn('live_boss_ihaq_connection_failed')}});
 socket.on('message',(data:unknown)=>{
  const event=normalizeIhaqEvent(data);if(!event)return;
  lastEventAt=event.p_at;
  if(pending>=500){console.error('live_boss_ihaq_queue_full');return}
  pending++;
  queue=queue.then(async()=>{
   for(let attempt=0;attempt<3;attempt++){
    try{const {error}=await db.rpc('rewards_boss_ihaq_event',event);if(!error)return;if(error.message==='invalid_event')return}catch{/* transient failure */}
    if(attempt<2)await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
   }
   console.error('live_boss_ihaq_event_failed');
  }).catch(()=>console.error('live_boss_ihaq_event_failed')).finally(()=>{pending--});
 });
 socket.connect();
 return socket;
}
