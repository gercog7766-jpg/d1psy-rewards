import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const db=createClient(process.env.SUPABASE_URL||'',process.env.SUPABASE_SECRET_KEY||'',{auth:{persistSession:false}});
const ENGINE_ENABLED=process.env.REWARDS_ENGINE_ENABLED!=='false';
let checking=false;

// Legacy giveaway belongs exclusively to the primary Twitch broadcaster.
// This lookup prevents secondary rounds from entering the singleton engine.
async function primaryStreamerId():Promise<string>{
  const {data,error}=await db.from('rewards_streamers').select('id').eq('is_primary',true).single();
  if(error||!data) throw error||new Error('primary_streamer_missing');
  return data.id;
}


async function startNextRound(){
  const streamerId=await primaryStreamerId();
  const {data:s}=await db.from('rewards_settings').select('*').eq('id',true).single();
  if(!s?.enabled || s.twitch_connection_status!=='connected') return;
  const {data:active,error:activeError}=await db.from('rewards_rounds').select('id').eq('streamer_id',streamerId).eq('status','active').maybeSingle();
  if(activeError) throw activeError;
  if(active) return;

  const {data:prizes,error:pErr}=await db.from('rewards_prizes').select('id,name').eq('status','available');
  if(pErr) throw pErr;
  if(!prizes?.length){
    await db.from('rewards_audit_log').insert({action:'round_start_failed',entity_type:'rewards_rounds',details:{reason:'no_available_prizes'}});
    return;
  }
  const reserved=new Set((await db.from('rewards_rounds').select('prize_id').eq('status','active')).data?.map(r=>r.prize_id)||[]);
  const free=prizes.filter(p=>!reserved.has(p.id));
  if(!free.length) return;
  const prize=free[crypto.randomInt(free.length)];
  const {data:round,error}=await db.from('rewards_rounds').insert({streamer_id:streamerId,mode:s.mode,interval_seconds:s.interval_seconds,message_threshold:s.message_threshold,status:'active',prize_id:prize.id}).select('id').single();
  if(error) throw error;
  await db.from('rewards_settings').update({selected_prize_id:prize.id,updated_at:new Date().toISOString()}).eq('id',true);
  await db.from('rewards_audit_log').insert({action:'round_prize_randomized',entity_type:'rewards_rounds',entity_id:round.id,details:{prize_id:prize.id,prize_name:prize.name,source:'automatic_next_round'}});
}

export async function checkGiveawayRound(){
  if(checking) return;
  checking=true;
  try{
    const {data:s}=await db.from('rewards_settings').select('*').eq('id',true).single();
    if(!s?.enabled || s.twitch_connection_status!=='connected') return;
    const streamerId=await primaryStreamerId();
    const {data:r,error:roundError}=await db.from('rewards_rounds').select('*').eq('streamer_id',streamerId).eq('status','active').maybeSingle();
    if(roundError) throw roundError;
    if(!r) return;
    const due=r.mode==='messages'
      ? r.message_count>=r.message_threshold
      : Date.now()>=new Date(r.started_at).getTime()+r.interval_seconds*1000;
    if(!due) return;
    const {data,error}=await db.rpc('rewards_finalize_round',{p_round_id:r.id});
    if(error){
      console.error('Round finalization failed',error.message);
      await db.from('rewards_audit_log').insert({action:'round_finalize_failed',entity_type:'rewards_rounds',entity_id:r.id,details:{message:error.message}});
      return;
    }
    console.log('Round finalized',data?.[0]||null);
    await startNextRound();
  } finally { checking=false; }
}

// Time-mode rounds must finish server-side even when chat is quiet. The isolated TEST
// service shares production credentials, so its legacy engine is explicitly disabled via
// REWARDS_ENGINE_ENABLED=false. Production behavior remains unchanged by default.
if(ENGINE_ENABLED){
  setInterval(()=>{void checkGiveawayRound().catch(e=>console.error('Giveaway engine tick failed',e));},1000);
}else{
  console.log('[GIVEAWAY_ENGINE] disabled by REWARDS_ENGINE_ENABLED=false');
}
