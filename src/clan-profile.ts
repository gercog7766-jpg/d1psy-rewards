// Founders cannot leave or transfer ownership; their committed clan row is the award receipt.
export async function attachClanProfiles(db:any,users:any[],viewerLogin?:string){
 const visible=users.filter(u=>!u.isPrivate||u.isSelf||u.login===viewerLogin);
 if(!visible.length)return;
 const {data,error}=await db.from('rewards_clan_members').select('user_id,rewards_users!inner(twitch_login),rewards_clans!inner(name,owner_id)').in('rewards_users.twitch_login',visible.map(u=>u.login)).is('left_at',null);
 if(error){console.error('clan_profile_lookup_failed',error.code);return;}
 const memberships=new Map((Array.isArray(data)?data:[]).filter(r=>r.rewards_users?.twitch_login&&typeof r.rewards_clans?.name==='string').map(r=>[r.rewards_users.twitch_login,{name:r.rewards_clans.name,owner:r.user_id===r.rewards_clans.owner_id}]));
 for(const u of visible){const clan=memberships.get(u.login);if(clan)u.clan=clan;}
}
export const clanProfileCss=`.clan-profile-tag{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;max-width:100%;min-width:0;min-height:25px;padding:4px 9px;border:1px solid #9454c178;border-radius:7px;background:#6e28a52d;color:#e2c2ff;font:700 12px/1.3 system-ui;text-decoration:none;vertical-align:middle}.clan-profile-tag span{min-width:0;overflow-wrap:anywhere}.clan-profile-tag img{width:16px;height:16px;object-fit:contain;flex:none}.clan-profile-tag:hover{border-color:#d0a0ff;color:#fff}.profile-info .clan-profile-tag,.person-info .clan-profile-tag{margin-top:6px}.person-info,.profile-info{min-width:0}.syndicate-owner-medal{border-color:#b16beb;background:linear-gradient(135deg,#442065,#251434);color:#efddff}.account-clan-tag{display:flex;width:fit-content;margin-top:5px;margin-left:auto}`;
