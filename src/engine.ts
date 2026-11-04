import { createClient } from '@supabase/supabase-js';

const db=createClient(process.env.SUPABASE_URL||'',process.env.SUPABASE_SECRET_KEY||'',{auth:{persistSession:false}});
const ENGINE_ENABLED=process.env.REWARDS_ENGINE_ENABLED!=='false';
let checking=false;

async function startNextRound(){
  const {data:settings,error:settingsError}=await db.from('rewards_settings')
    .select('enabled,twitch_connection_status').eq('id',true).single();
  if(settingsError) throw settingsError;
  if(!settings.enabled||settings.twitch_connection_status!=='connected') return;
  const {error}=await db.rpc('rewards_legacy_start_round');
  if(error){
    if(['round_already_active','no_available_prizes','twitch_not_connected']
      .some(reason=>error.message.includes(reason))) return;
    throw error;
  }
}

export async function checkGiveawayRound(){
  if(checking) return;
  checking=true;
  try{
    const {data:s}=await db.from('rewards_settings').select('*').eq('id',true).single();
    if(!s?.enabled || s.twitch_connection_status!=='connected') return;
    const {data:r,error:roundError}=await db.from('rewards_rounds').select('*').is('streamer_id',null).eq('status','active').maybeSingle();
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
