import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const db=createClient(process.env.SUPABASE_URL||'',process.env.SUPABASE_SECRET_KEY||'',{auth:{persistSession:false}});
const checking=new Set<string>();

export type StreamerContext={id:string;twitchBroadcasterId:string;twitchLogin:string};

export async function resolveStreamerByBroadcasterId(broadcasterId:string):Promise<StreamerContext|null>{
  const {data,error}=await db.from('rewards_streamers').select('id,twitch_broadcaster_id,twitch_login,enabled').eq('twitch_broadcaster_id',broadcasterId).maybeSingle();
  if(error) throw error;
  if(!data?.enabled) return null;
  return {id:data.id,twitchBroadcasterId:data.twitch_broadcaster_id,twitchLogin:data.twitch_login};
}

async function getSettings(streamerId:string){
  const {data,error}=await db.from('rewards_streamer_settings').select('*').eq('streamer_id',streamerId).maybeSingle();
  if(error) throw error;
  return data;
}

async function startNextRound(streamer:StreamerContext){
  const s=await getSettings(streamer.id);
  if(!s?.enabled||s.twitch_connection_status!=='connected') return;
  const {data:active,error:activeError}=await db.from('rewards_rounds').select('id').eq('streamer_id',streamer.id).eq('status','active').maybeSingle();
  if(activeError) throw activeError;
  if(active) return;
  const {data:prizes,error:pErr}=await db.from('rewards_prizes').select('id,name').eq('status','available');
  if(pErr) throw pErr;
  if(!prizes?.length){
    await db.from('rewards_audit_log').insert({action:'round_start_failed',entity_type:'rewards_rounds',details:{reason:'no_available_prizes',streamer_id:streamer.id,streamer_login:streamer.twitchLogin}});
    return;
  }
  const prize=prizes[crypto.randomInt(prizes.length)];
  const {data:round,error}=await db.from('rewards_rounds').insert({streamer_id:streamer.id,mode:s.mode,interval_seconds:s.interval_seconds,message_threshold:s.message_threshold,status:'active',prize_id:prize.id}).select('id').single();
  if(error) throw error;
  await db.from('rewards_streamer_settings').update({selected_prize_id:prize.id,updated_at:new Date().toISOString()}).eq('streamer_id',streamer.id);
  await db.from('rewards_audit_log').insert({action:'round_prize_randomized',entity_type:'rewards_rounds',entity_id:round.id,details:{streamer_id:streamer.id,streamer_login:streamer.twitchLogin,prize_id:prize.id,prize_name:prize.name,source:'automatic_next_round'}});
}

export async function recordStreamerChat(messageId:string,event:{chatter_user_id:string},occurredAt:string,streamer:StreamerContext){
  const dedupId=`${streamer.twitchBroadcasterId}:${messageId}`;
  const {error:dedupError}=await db.from('rewards_event_dedup').insert({event_id:dedupId,event_type:'channel.chat.message'});
  if(dedupError){if(dedupError.code==='23505')return;throw dedupError}
  const {data:round,error:roundError}=await db.from('rewards_rounds').select('id,status').eq('streamer_id',streamer.id).eq('status','active').maybeSingle();
  if(roundError) throw roundError;
  const {error:eventError}=await db.from('rewards_chat_events').insert({twitch_event_id:messageId,streamer_id:streamer.id,round_id:round?.id||null,twitch_user_id:event.chatter_user_id,occurred_at:occurredAt});
  if(eventError) throw eventError;
  if(!round) return;
  const {error}=await db.rpc('rewards_record_chat_message',{p_round_id:round.id,p_twitch_user_id:event.chatter_user_id});
  if(error) throw error;
  await checkStreamerRound(streamer);
}

export async function checkStreamerRound(streamer:StreamerContext){
  if(checking.has(streamer.id)) return;
  checking.add(streamer.id);
  try{
    const s=await getSettings(streamer.id);
    if(!s?.enabled||s.twitch_connection_status!=='connected') return;
    const {data:r,error:rError}=await db.from('rewards_rounds').select('*').eq('streamer_id',streamer.id).eq('status','active').maybeSingle();
    if(rError) throw rError;
    if(!r) return;
    const due=r.mode==='messages'?r.message_count>=r.message_threshold:Date.now()>=new Date(r.started_at).getTime()+r.interval_seconds*1000;
    if(!due) return;
    const {data,error}=await db.rpc('rewards_finalize_round',{p_round_id:r.id});
    if(error){
      console.error('[MULTISTREAM] round finalization failed',streamer.twitchLogin,error.message);
      await db.from('rewards_audit_log').insert({action:'round_finalize_failed',entity_type:'rewards_rounds',entity_id:r.id,details:{streamer_id:streamer.id,streamer_login:streamer.twitchLogin,message:error.message}});
      return;
    }
    console.log('[MULTISTREAM] round finalized',streamer.twitchLogin,data?.[0]||null);
    await startNextRound(streamer);
  }finally{checking.delete(streamer.id)}
}

export async function tickStreamerRounds(){
  const {data,error}=await db.from('rewards_streamers').select('id,twitch_broadcaster_id,twitch_login').eq('enabled',true);
  if(error) throw error;
  await Promise.all((data||[]).map(s=>checkStreamerRound({id:s.id,twitchBroadcasterId:s.twitch_broadcaster_id,twitchLogin:s.twitch_login})));
}
