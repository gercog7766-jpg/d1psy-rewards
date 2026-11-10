/** Only a Twitch CDN avatar is persisted; omitted images never erase a saved one. */
export function twitchAvatarFields(value:unknown):{twitch_avatar_url?:string} {
 if(typeof value!=='string')return {};
 try{const u=new URL(value);if(u.protocol==='https:'&&u.hostname==='static-cdn.jtvnw.net'&&!u.username&&!u.password&&!u.port)return {twitch_avatar_url:u.href};}catch{}
 return {};
}

/** Repair existing missing photos in bounded batches, without delaying user APIs. */
export function createTwitchAvatarSync(db:any,fetcher:typeof fetch=fetch,now=Date.now){
 let pending:Promise<void>|null=null,nextCheck=0,token='',expires=0;
 async function refresh(){
  const result=await db.from('rewards_users').select('twitch_user_id').or('twitch_avatar_url.is.null,twitch_avatar_url.eq.').order('id').limit(100);
  if(result.error)throw Error('avatar_read_failed');
  const ids=[...new Set<string>((result.data||[]).map((u:any)=>u.twitch_user_id).filter((id:unknown):id is string=>typeof id==='string'&&id.length>0&&id.length<=100))];
  if(!ids.length)return;
  if(!token||now()>=expires-60000){
   const response=await fetcher('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.TWITCH_CLIENT_ID||'',client_secret:process.env.TWITCH_CLIENT_SECRET||'',grant_type:'client_credentials'}),signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error('avatar_token_failed');const data:any=await response.json();if(typeof data.access_token!=='string'||!data.access_token)throw Error('avatar_token_failed');token=data.access_token;expires=now()+Math.max(0,Number(data.expires_in)||0)*1000;
  }
  const query=new URLSearchParams();for(const id of ids)query.append('id',id);
  const response=await fetcher('https://api.twitch.tv/helix/users?'+query,{headers:{'Client-Id':process.env.TWITCH_CLIENT_ID||'',Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
  if(response.status===401){token='';expires=0;}if(!response.ok)throw Error('avatar_lookup_failed');
  const data:any=await response.json();if(!Array.isArray(data.data))throw Error('avatar_lookup_failed');
  // A late repair must not overwrite a newer OAuth photo. Never upsert identities.
  for(const user of data.data){const fields=twitchAvatarFields(user.profile_image_url);if(!ids.includes(String(user.id))||!fields.twitch_avatar_url)continue;
   const saved=await db.from('rewards_users').update(fields).eq('twitch_user_id',String(user.id)).or('twitch_avatar_url.is.null,twitch_avatar_url.eq.');if(saved.error)throw Error('avatar_write_failed');
  }
 }
 return function sync(){
  if(pending)return pending;if(!process.env.TWITCH_CLIENT_ID||!process.env.TWITCH_CLIENT_SECRET||now()<nextCheck)return Promise.resolve();
  nextCheck=now()+60000;pending=refresh().catch(()=>{console.error('twitch_avatar_sync_failed')}).finally(()=>{pending=null});return pending;
 };
}
