// Explicit opt-in gate for the second isolated Twitch broadcaster.
// The real Twitch user ID is learned from Twitch OAuth, never from a fixture.
const REQUIRED_SCOPES=Object.freeze(['user:read:chat','user:bot','channel:bot']);
export function validatePrimaryTwitchIdentity({tokenInfo,userInfo,expectedClientId}={}){
 if(typeof expectedClientId!=='string'||!/^[a-z0-9]{20,64}$/.test(expectedClientId))
  return {ok:false,reason:'missing_isolated_client_id'};
 if(tokenInfo?.client_id!==expectedClientId)return {ok:false,reason:'wrong_twitch_application'};
 if(typeof tokenInfo.user_id!=='string'||!/^[0-9]+$/.test(tokenInfo.user_id)||
    userInfo?.id!==tokenInfo.user_id||
    String(tokenInfo.login||'').toLowerCase()!=='d1psy_off'||
    String(userInfo.login||'').toLowerCase()!=='d1psy_off')
  return {ok:false,reason:'wrong_twitch_account'};
 if(!Array.isArray(tokenInfo.scopes)||!REQUIRED_SCOPES.every(s=>tokenInfo.scopes.includes(s)))
  return {ok:false,reason:'missing_chat_permission'};
 if(!Number.isFinite(tokenInfo.expires_in)||tokenInfo.expires_in<=0)
  return {ok:false,reason:'expired_or_invalid_token'};
 if(tokenInfo.user_id==='39780903')return {ok:false,reason:'duplicate_amych_identity'};
 return {ok:true,broadcaster_id:tokenInfo.user_id,login:'d1psy_off',scopes:[...REQUIRED_SCOPES]};
}
