// Match by immutable Twitch identity, never by display name or a client flag.
export async function attachStreamerPartners(db:any, users:any[]) {
 if (!users.length) return;
 const identities=await db.from('rewards_users').select('twitch_login,twitch_user_id').in('twitch_login',users.map(u=>u.login));
 if(identities.error)throw Error('partners_unavailable');
 const ids=(identities.data||[]).map((u:any)=>u.twitch_user_id);
 if(!ids.length){for(const u of users)u.partner=false;return;}
 const [primary,partners]=await Promise.all([
  db.from('rewards_streamers').select('twitch_broadcaster_id').eq('is_primary',true).in('twitch_broadcaster_id',ids),
  db.from('rewards_streamer_live_profiles').select('broadcaster_id').eq('status','approved').in('broadcaster_id',ids)
 ]);
 if(primary.error||partners.error)throw Error('partners_unavailable');
 const approved=new Set([...(primary.data||[]).map((x:any)=>x.twitch_broadcaster_id),...(partners.data||[]).map((x:any)=>x.broadcaster_id)]);
 const logins=new Set((identities.data||[]).filter((x:any)=>approved.has(x.twitch_user_id)).map((x:any)=>x.twitch_login));
 for(const u of users)u.partner=logins.has(u.login);
}
