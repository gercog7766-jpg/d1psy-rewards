// Fail closed: a secondary broadcaster may only authorize in an isolated PoC.
export function pocOauthAllowed({routesEnabled,isolation,multistreamDbEnabled,expectedLogin}){
 return routesEnabled===true&&isolation===true&&multistreamDbEnabled===false
   &&typeof expectedLogin==='string'&&expectedLogin.trim().length>0;
}
export function matchesPocAccount(user,{expectedLogin,expectedBroadcasterId}){
 if(!user||typeof user.login!=='string'||!/^\d+$/.test(String(user.id||'')))return false;
 if(user.login.toLowerCase()!==String(expectedLogin||'').trim().toLowerCase())return false;
 if(expectedBroadcasterId&&String(user.id)!==String(expectedBroadcasterId))return false;
 return true;
}

export function pocStorageAllowed({supabaseUrl,isolatedStorageVerified}){
 if(isolatedStorageVerified!==true)return false;
 try{
  const url=new URL(supabaseUrl);
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash)return false;
  if(!/^[a-z0-9]{20}\\.supabase\\.co$/.test(url.hostname))return false;
  return url.hostname!=='ssqjogdcynmjjgtxknng.supabase.co';
 }catch{return false;}
}
