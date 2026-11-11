import {twitchAvatarFields} from './twitch-avatars.js';

/** The server only passes identity obtained from Twitch Helix. Registration and
 * optional first-visit referral binding share one database transaction. */
export async function registerTwitchIdentity(db:any,profile:any,invitation:unknown){
 const raw=typeof invitation==='string'?invitation.trim().toLowerCase():'';
 const {data,error}=await db.rpc('rewards_register_twitch_identity',{
  p_twitch_id:String(profile.id),
  p_login:String(profile.login).toLowerCase(),
  p_display_name:String(profile.display_name||profile.login),
  p_avatar_url:twitchAvatarFields(profile.profile_image_url).twitch_avatar_url||null,
  p_referral_code:/^[a-f0-9]{24}$/.test(raw)?raw:null
 });
 if(error||!data?.userId)throw Error('user_registration_failed');
 return data;
}
