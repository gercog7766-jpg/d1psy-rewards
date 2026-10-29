import express from 'express';
import { createClient } from '@supabase/supabase-js';

const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});

export function installAccountStatusHotfix(){
  const proto:any=(express as any).application;
  const originalGet=proto.get;
  proto.get=function(path:any,...handlers:any[]){
    if(path!=='/api/me') return originalGet.call(this,path,...handlers);
    const base=handlers[handlers.length-1];
    const guards=handlers.slice(0,-1);
    const enriched=async(req:any,res:any)=>{
      const originalJson=res.json.bind(res);
      res.json=async(body:any)=>{
        if(!body||!body.id)return originalJson(body);
        try{
          const {data:round}=await db.from('rewards_rounds').select('id,mode,status,started_at,interval_seconds,message_threshold,message_count').eq('status','active').maybeSingle();
          let participation:any=null;
          let participantCount=0;
          if(round){
            const [{data:part},{count}]=await Promise.all([
              db.from('rewards_round_participants').select('eligible,message_count').eq('round_id',round.id).eq('user_id',body.id).maybeSingle(),
              db.from('rewards_round_participants').select('user_id',{count:'exact',head:true}).eq('round_id',round.id)
            ]);
            participation=part||null;
            participantCount=count||0;
          }
          return originalJson({...body,currentGiveaway:round?{...round,participant_count:participantCount,participating:!!participation?.eligible,user_message_count:participation?.message_count||0}:null});
        }catch{return originalJson({...body,currentGiveaway:null})}
      };
      return base(req,res);
    };
    return originalGet.call(this,path,...guards,enriched);
  };
}
