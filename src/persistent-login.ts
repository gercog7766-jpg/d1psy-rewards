import {randomBytes,createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Request,Response,NextFunction} from 'express';
export type LoginSession={twitchUserId:string;login:string;displayName:string;exp:number;deviceSession?:boolean};
export const deviceHash=(token:string)=>createHash('sha256').update(token).digest('hex');
const DAYS=180*86400000;
export function persistentLogin(db:SupabaseClient,appUrl:string,read:(req:Request)=>LoginSession|null,encode:(s:LoginSession)=>string){
 const options={httpOnly:true,secure:appUrl.startsWith('https:'),sameSite:'lax' as const,path:'/'};
 async function create(req:Request,res:Response,s:LoginSession){
  const {data:u,error:ue}=await db.from('rewards_users').select('id,banned').eq('twitch_user_id',s.twitchUserId).single();
  if(ue||!u||u.banned)throw Error('persistent_user_unavailable');
  const token=randomBytes(32).toString('base64url'),hash=deviceHash(token);
  const {error}=await db.from('rewards_device_sessions').insert({token_hash:hash,user_id:u.id});if(error)throw Error('persistent_login_unavailable');
  // Rotate this device's old token only after the new one is durable.
  if(/^[\w-]{43}$/.test(req.cookies?.rewards_device||''))await db.from('rewards_device_sessions').delete().eq('token_hash',deviceHash(req.cookies.rewards_device));
  req.cookies.rewards_device=token;res.cookie('rewards_device',token,{...options,maxAge:DAYS});
  const signed=encode({...s,deviceSession:true,exp:Date.now()+7*86400000});req.cookies.rewards_session=signed;
  res.cookie('rewards_session',signed,{...options,maxAge:7*86400000});
 }
 async function middleware(req:Request,res:Response,next:NextFunction){
  // Public assets and webhook traffic do not read or renew account state.
  if(!/^\/(api\/me(?:\/|$)|api\/admin(?:\/|$)|api\/users(?:\/|$)|users(?:\/|$)|account$|referrals$|community$|app$|logout$|games(?:\/|$)|live$|predict$|shop$|season$|upgrader$|contracts$|admin(?:\/|$))/.test(req.path)||/\.(?:js|png|webp|svg)$/.test(req.path))return next();
  const token=req.cookies?.rewards_device;
  try{
   if(token){
    const {data,error}=await db.rpc('rewards_device_resolve',{p_hash:deviceHash(String(token))});
    if(error){if(req.path==='/logout')return next();return res.status(503).set('Cache-Control','no-store').send('Не удалось восстановить вход. Попробуй ещё раз.');}
    if(!data){delete req.cookies.rewards_session;res.clearCookie('rewards_session',options);res.clearCookie('rewards_device',options);return next()}
    const signed=encode({...data,exp:Date.now()+7*86400000,deviceSession:true});req.cookies.rewards_session=signed;
    res.locals.deviceHash=deviceHash(String(token));
    // Refresh persistent expiry at most once daily using a browser marker.
    if(req.cookies.rewards_device_seen!==new Date().toISOString().slice(0,10)){
     res.cookie('rewards_device',token,{...options,maxAge:Math.max(0,new Date(data.expiresAt).getTime()-Date.now())});
     res.cookie('rewards_device_seen',new Date().toISOString().slice(0,10),{...options,maxAge:86400000});
    }
   }else{
    const s=read(req);if(s?.deviceSession){delete req.cookies.rewards_session;res.clearCookie('rewards_session',options)}
    else if(s&&['/account','/app','/api/me','/api/me/site-presence'].includes(req.path)){await create(req,res,s);res.locals.deviceHash=deviceHash(req.cookies.rewards_device)}
   }
   next();
  }catch{if(req.path==='/logout')return next();res.status(503).set('Cache-Control','no-store').send('Не удалось сохранить вход. Попробуй ещё раз.');}
 }
 async function logout(req:Request,res:Response){
  const token=req.cookies?.rewards_device;
  if(token){const {error}=await db.from('rewards_device_sessions').delete().eq('token_hash',deviceHash(String(token)));if(error)return res.status(503).send('Не удалось завершить сеанс. Попробуй ещё раз.');}
  for(const name of ['rewards_session','rewards_device','rewards_device_seen'])res.clearCookie(name,options);
  res.set('Cache-Control','no-store').redirect('/');
 }
 return {create,middleware,logout};
}
