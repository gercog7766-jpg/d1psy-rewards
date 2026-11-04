// Read-only preflight. No Twitch requests, database queries or secret output.
import {pocOauthAllowed} from '../src/poc-oauth-guard.mjs';
import {isolatedCallbackUrl} from '../src/poc-callback-guard.mjs';

export function inspectPocEnvironment(env){
 const appUrl=env.APP_URL||'';
 const callback=isolatedCallbackUrl(appUrl);
 const redirect=callback?new URL('/auth/twitch/callback',appUrl).href:null;
 const checks={
   isolated_flags:pocOauthAllowed({
     routesEnabled:env.TWITCH_POC_ROUTES_ENABLED==='true',
     isolation:env.TWITCH_POC_ISOLATION==='true',
     multistreamDbEnabled:env.MULTISTREAM_DB_ENABLED==='true',
     expectedLogin:env.TWITCH_POC_LOGIN||'amych'
   }),
   correct_host:!!callback,
   exact_redirect:!!redirect&&env.TWITCH_REDIRECT_URI===redirect,
   expected_login:(env.TWITCH_POC_LOGIN||'').toLowerCase()==='amych',
   expected_broadcaster:env.TWITCH_POC_BROADCASTER_ID==='39780903',
   atomic_writes_off:env.ATOMIC_CHAT_RPC_ENABLED!=='true',
   live_giveaways_off:env.ENABLE_GIVEAWAYS!=='true',
   twitch_credentials_present:!!env.TWITCH_CLIENT_ID&&!!env.TWITCH_CLIENT_SECRET&&!!env.TWITCH_EVENTSUB_SECRET,
   database_configured:!!env.SUPABASE_URL&&!!env.SUPABASE_SECRET_KEY
 };
 // A shared production database is explicitly NOT safe for live OAuth testing.
 const isolatedDb=!!env.SUPABASE_URL&&!env.SUPABASE_URL.includes('ssqjogdcynmjjgtxknng');
 checks.production_supabase_not_used=isolatedDb;
 return {ready:Object.values(checks).every(Boolean),checks};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const result=inspectPocEnvironment(process.env);
 console.log(JSON.stringify(result,null,2));
 if(!result.ready)process.exitCode=1;
}
