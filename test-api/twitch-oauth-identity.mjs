// Pure validation for a future isolated Twitch OAuth exchange.
// No network requests, no token persistence, no authorization endpoint.
const EXPECTED_BROADCASTER_ID='39780903';
const REQUIRED_SCOPES=Object.freeze(['user:read:chat','user:bot','channel:bot']);
export function validateIsolatedTwitchIdentity({tokenInfo,userInfo,expectedClientId}={}){
 if(typeof expectedClientId!=='string'||!/^[a-z0-9]{20,64}$/.test(expectedClientId))
  return {ok:false,reason:'missing_isolated_client_id'};
 if(!tokenInfo||tokenInfo.client_id!==expectedClientId)
  return {ok:false,reason:'wrong_twitch_application'};
 if(tokenInfo.user_id!==EXPECTED_BROADCASTER_ID||
    userInfo?.id!==EXPECTED_BROADCASTER_ID||
    String(tokenInfo.login||'').toLowerCase()!=='amych'||
    String(userInfo.login||'').toLowerCase()!=='amych')
  return {ok:false,reason:'wrong_twitch_account'};
 if(!Array.isArray(tokenInfo.scopes)||!REQUIRED_SCOPES.every(s=>tokenInfo.scopes.includes(s)))
  return {ok:false,reason:'missing_chat_permission'};
 if(!Number.isFinite(tokenInfo.expires_in)||tokenInfo.expires_in<=0)
  return {ok:false,reason:'expired_or_invalid_token'};
 return {ok:true,broadcaster_id:EXPECTED_BROADCASTER_ID,scopes:[...REQUIRED_SCOPES]};
}
