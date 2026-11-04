// Keep secondary-channel EventSub callbacks on a dedicated non-production host.
export function isolatedCallbackUrl(appUrl,productionHost='d1psy-rewards.onrender.com'){
 try{
   const url=new URL(appUrl);
   if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')return null;
   if(url.hostname.toLowerCase()===productionHost.toLowerCase())return null;
   if(url.hostname.toLowerCase()!=='d1psy-rewards-multistream-test.onrender.com')return null;
   return url.origin+'/eventsub/twitch';
 }catch{return null;}
}
