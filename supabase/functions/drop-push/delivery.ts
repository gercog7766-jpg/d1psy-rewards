// Shared by the Edge runtime and isolated Node tests; never logs endpoints or keys.
export async function deliverJobs(db:any,send:(sub:any,payload:string)=>Promise<void>){
 const {data:jobs,error}=await db.rpc('rewards_push_claim');if(error)throw Error('push_claim_failed');
 const report={claimed:jobs?.length||0,sent:0,expired:0,retry:0};
 for(let start=0;start<(jobs||[]).length;start+=5){await Promise.all(jobs.slice(start,start+5).map(async(job:any)=>{
  const {data:sub,error:se}=await db.from('rewards_push_subscriptions').select('id,endpoint,p256dh,auth,device_token_hash').eq('id',job.subscription_id).maybeSingle();
  if(se)throw Error('push_subscription_lookup_failed');
  if(!sub){await db.from('rewards_push_jobs').update({status:'done',lease_until:null}).eq('id',job.id);return}
  const {data:session,error:de}=await db.rpc('rewards_device_resolve',{p_hash:sub.device_token_hash});
  if(de)throw Error('push_device_lookup_failed');
  if(!session){await db.from('rewards_push_subscriptions').delete().eq('id',sub.id);report.expired++;return}
  try{
   await send({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify(job.payload));
   const {error:ue}=await db.from('rewards_push_jobs').update({status:'done',lease_until:null,last_error:null}).eq('id',job.id);if(ue)throw Error('push_ack_failed');report.sent++;
  }catch(e:any){
   const code=Number(e.statusCode)||0;
   if(code===404||code===410){await db.from('rewards_push_subscriptions').delete().eq('id',sub.id);report.expired++;return}
   const retry=job.attempts<6&&(code===0||code===429||code>=500);
   await db.from('rewards_push_jobs').update({status:retry?'queued':'failed',lease_until:null,last_error:code?'http_'+code:'transport_error',next_attempt_at:new Date(Date.now()+Math.min(3600,30*2**job.attempts)*1000).toISOString()}).eq('id',job.id);if(retry)report.retry++;
  }
 }))}
 return report;
}
