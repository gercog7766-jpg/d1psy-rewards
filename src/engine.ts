import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const db=createClient(process.env.SUPABASE_URL||'',process.env.SUPABASE_SECRET_KEY||'',{auth:{persistSession:false}});
let checking=false;

async function startNextRound(){
  const {data:s}=await db.from('rewards_settings').select('*').eq('id',true).single();
  if(!s?.enabled || s.twitch_connection_status!=='connected') return;
  const {data:active}=await db.from('rewards_rounds').select('id').eq('status','active').maybeSingle();
  if(active) return;

  const {data:prizes,error:pErr}=await db.from('rewards_prizes').select('id,name').eq('status','available');
  if(pErr) throw pErr;
  if(!prizes?.length){
    await db.from('rewards_audit_log').insert({action:'round_start_failed',entity_type:'rewards_rounds',details:{reason:'no_available_prizes'}});
    return;
  }
  const prize=prizes[crypto.randomInt(prizes.length)];
  const {data:round,error}=await db.from('rewards_rounds').insert({mode:s.mode,interval_seconds:s.interval_seconds,message_threshold:s.message_threshold,status:'active',prize_id:prize.id}).select('id').single();
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
    const {data:r}=await db.from('rewards_rounds').select('*').eq('status','active').maybeSingle();
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

// Time-mode rounds must finish server-side even when chat is quiet.
setInterval(()=>{void checkGiveawayRound().catch(e=>console.error('Giveaway engine tick failed',e));},1000);
