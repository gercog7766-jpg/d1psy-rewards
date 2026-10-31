import express from 'express';

/**
 * Keeps Twitch OAuth state server-side for the short authorization window.
 * This is a fallback for Telegram/iOS in-app browsers that can drop the
 * oauth_state cookie while leaving the normal cookie-based flow untouched.
 *
 * The state remains random, single-use and expires after 10 minutes.
 * If the login was started from /ref/:login, the referrer is carried with
 * that same state and restored after Twitch returns.
 */
export function installOauthStateHotfix(){
  const proto:any=(express as any).application;
  const originalGet=proto.get;
  const pending=new Map<string,{expires:number;referrer:string|null}>();
  const TTL=10*60*1000;

  function prune(){
    const now=Date.now();
    for(const [key,value] of pending){if(value.expires<=now)pending.delete(key)}
  }

  proto.get=function(path:any,...handlers:any[]){
    if(path==='/auth/twitch'){
      handlers=handlers.map((handler:any)=>typeof handler==='function'?function(req:any,res:any,next:any){
        const originalRedirect=res.redirect.bind(res);
        res.redirect=function(...args:any[]){
          try{
            const target=String(args[args.length-1]||'');
            if(target.startsWith('https://id.twitch.tv/oauth2/authorize')){
              const state=new URL(target).searchParams.get('state');
              if(state){
                prune();
                const raw=String(req.cookies?.rewards_ref||'').trim().toLowerCase();
                const referrer=/^[a-z0-9_]{3,25}$/.test(raw)?raw:null;
                pending.set(state,{expires:Date.now()+TTL,referrer});
                console.log('oauth_state_saved',{hasReferrer:!!referrer});
              }
            }
          }catch(e){console.error('oauth_state_save_failed',e)}
          return originalRedirect(...args);
        };
        return handler(req,res,next);
      }:handler);
    }

    if(path==='/auth/twitch/callback'){
      handlers=handlers.map((handler:any)=>typeof handler==='function'?async function(req:any,res:any,next:any){
        prune();
        const state=typeof req.query?.state==='string'?req.query.state:'';
        const entry=state?pending.get(state):undefined;
        if(entry){
          // Single-use before token exchange: replayed callbacks cannot pass.
          pending.delete(state);
          req.cookies=req.cookies||{};
          if(!req.cookies.oauth_state){
            req.cookies.oauth_state=state;
            console.log('oauth_state_restored');
          }
          if(entry.referrer){
            // Restore referral context even when the in-app browser dropped
            // the original rewards_ref cookie during the Twitch round trip.
            req.cookies.rewards_ref=entry.referrer;
            res.cookie('rewards_ref',entry.referrer,{
              httpOnly:true,
              secure:String(process.env.APP_URL||'').startsWith('https:'),
              sameSite:'lax',
              maxAge:7*24*60*60*1000,
              path:'/'
            });
            console.log('oauth_referrer_restored');
          }
        }else{
          console.warn('oauth_state_not_found',{hasState:!!state,hasCookie:!!req.cookies?.oauth_state});
        }
        return handler(req,res,next);
      }:handler);
    }
    return originalGet.call(this,path,...handlers);
  };
}
