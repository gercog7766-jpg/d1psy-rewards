import express from 'express';

/** Referrals can only be bound inside the first-registration OAuth transaction.
 * A previously saved invitation is never applied to an existing account. */
export async function attachPendingReferral(req:any,res:any,_userId?:string){
 if(!req.cookies?.rewards_ref)return;
 if(!res.locals.session?.twitchUserId)return;
 res.clearCookie('rewards_ref',{path:'/'});
 delete req.cookies.rewards_ref;
}
export function installReferralOauthHotfix(){
 const p:any=(express as any).application,get=p.get;
 p.get=function(path:any,...handlers:any[]){
  if(path==='/api/me'&&handlers.length>1){
   const last=handlers.length-1,original=handlers[last];
   handlers[last]=async(req:any,res:any,next:any)=>{
    await attachPendingReferral(req,res);
    return original(req,res,next);
   };
  }
  return get.call(this,path,...handlers);
 };
}
