/** Move only this project's old webhook. Other channels/transports/callbacks are untouched. */
export async function ensureWebhookSubscription(options:{broadcaster:string;clientId:string;token:string;secret:string;callback:string;legacyCallback:string;type?:'channel.chat.message'|'stream.online'|'stream.offline'},request:typeof fetch=fetch){
 const endpoint='https://api.twitch.tv/helix/eventsub/subscriptions';
 const headers={Authorization:'Bearer '+options.token,'Client-Id':options.clientId,'Content-Type':'application/json'};
 // Also recognize the exact duplicated-origin callback caused by the reported APP_URL paste error.
 const currentOrigin=new URL(options.callback).origin;
 const previousCallbacks=new Set([options.legacyCallback,...['callback','callbac'].map(tail=>currentOrigin+currentOrigin+'/auth/twitch/'+tail+'/eventsub/twitch')]);
 const type=options.type||'channel.chat.message';const condition={broadcaster_user_id:options.broadcaster,...(type==='channel.chat.message'?{user_id:options.broadcaster}:{})};
 async function create(){const r=await request(endpoint,{method:'POST',headers,signal:AbortSignal.timeout(15000),body:JSON.stringify({type,version:'1',condition,transport:{method:'webhook',callback:options.callback,secret:options.secret}})});return {response:r,body:await r.json().catch(()=>({})) as any}}
 async function inspect(){let after='';const legacy:string[]=[];let unknown=false;
  for(let page=0;page<20;page++){const url=new URL(endpoint);url.searchParams.set('type',type);url.searchParams.set('first','100');if(after)url.searchParams.set('after',after);
   const r=await request(url,{headers,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('eventsub_list_failed_'+r.status);const body:any=await r.json();
   for(const s of body.data||[]){if(s.type!==type||s.version!=='1'||s.condition?.broadcaster_user_id!==options.broadcaster||type==='channel.chat.message'&&s.condition?.user_id!==options.broadcaster)continue;
    if(s.transport?.method==='webhook'&&s.transport.callback===options.callback&&['enabled','webhook_callback_verification_pending'].includes(s.status))return {current:s,legacy:[]};
    if(s.transport?.method==='webhook'&&typeof s.id==='string'&&(s.transport.callback!==options.callback&&previousCallbacks.has(s.transport.callback)||s.transport.callback===options.callback&&['webhook_callback_verification_failed','notification_failures_exceeded'].includes(s.status)))legacy.push(s.id);else unknown=true;
   }
   if(!body.pagination?.cursor){if(unknown)throw Error('eventsub_callback_conflict');return {current:null,legacy}}after=body.pagination.cursor;
  }throw Error('eventsub_list_incomplete');
 }
 let result=await create();if(result.response.ok)return result.body;if(result.response.status!==409)throw Error('eventsub_subscribe_failed_'+result.response.status);
 const existing=await inspect();if(existing.current)return {data:[existing.current],alreadyExists:true};if(!existing.legacy.length)throw Error('eventsub_callback_conflict');
 for(const id of existing.legacy){const url=new URL(endpoint);url.searchParams.set('id',id);const r=await request(url,{method:'DELETE',headers,signal:AbortSignal.timeout(10000)});if(!r.ok&&r.status!==404)throw Error('eventsub_delete_failed_'+r.status)}
 result=await create();if(result.response.ok)return result.body;
 // Another authorized reconnect may have won the race after the old webhook was removed.
 if(result.response.status===409){const concurrent=await inspect();if(concurrent.current)return {data:[concurrent.current],alreadyExists:true}}
 throw Error('eventsub_subscribe_failed_'+result.response.status);
}
