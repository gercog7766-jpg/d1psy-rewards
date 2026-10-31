import crypto from 'node:crypto';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

const APP_URL=process.env.APP_URL||'';
const SUPABASE_URL=process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co';
const SUPABASE_SECRET_KEY=process.env.SUPABASE_SECRET_KEY||'not-configured';
const TWITCH_CLIENT_ID=process.env.TWITCH_CLIENT_ID||'';
const TWITCH_CLIENT_SECRET=process.env.TWITCH_CLIENT_SECRET||'';
const TWITCH_REDIRECT_URI=process.env.TWITCH_REDIRECT_URI||`${APP_URL}/auth/twitch/callback`;
const TWITCH_CHANNEL_LOGIN=(process.env.TWITCH_CHANNEL_LOGIN||'d1psy_off').toLowerCase();
const SESSION_SECRET=process.env.SESSION_SECRET||'';
const db=createClient(SUPABASE_URL,SUPABASE_SECRET_KEY,{auth:{persistSession:false}});

function encodeSession(s:any){
  const p=Buffer.from(JSON.stringify(s)).toString('base64url');
  const sig=crypto.createHmac('sha256',SESSION_SECRET).update(p).digest('base64url');
  return `${p}.${sig}`;
}

export function installOauthReferralFixHotfix(){
  const proto:any=(express as any).application;
  const originalGet=proto.get;
  proto.get=function(path:any,...handlers:any[]){
    if(path==='/auth/twitch/callback'){
      const fixed=async(req:any,res:any)=>{
        try{
          if(!SESSION_SECRET) throw new Error('SESSION_SECRET is not configured');
          if(!req.query.code||!req.query.state||req.query.state!==req.cookies?.oauth_state){
            return res.status(400).send('Invalid OAuth state');
          }
          const tokenRes=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:TWITCH_CLIENT_ID,client_secret:TWITCH_CLIENT_SECRET,code:String(req.query.code),grant_type:'authorization_code',redirect_uri:TWITCH_REDIRECT_URI})});
          if(!tokenRes.ok) throw new Error(`OAuth token exchange failed ${tokenRes.status}`);
          const token:any=await tokenRes.json();
          const userRes=await fetch('https://api.twitch.tv/helix/users',{headers:{Authorization:`Bearer ${token.access_token}`,'Client-Id':TWITCH_CLIENT_ID}});
          if(!userRes.ok) throw new Error(`Twitch user lookup failed ${userRes.status}`);
          const user:any=(await userRes.json()).data?.[0];
          if(!user?.id) throw new Error('Twitch user missing');

          const {data:me,error:userError}=await db.from('rewards_users').upsert({twitch_user_id:String(user.id),twitch_login:String(user.login),twitch_display_name:String(user.display_name||user.login),twitch_avatar_url:user.profile_image_url?String(user.profile_image_url):null,updated_at:new Date().toISOString()},{onConflict:'twitch_user_id'}).select('id').single();
          if(userError||!me) throw userError||new Error('User upsert failed');

          if(String(user.login).toLowerCase()===TWITCH_CHANNEL_LOGIN){
            const {error}=await db.from('rewards_admins').upsert({twitch_user_id:String(user.id)},{onConflict:'twitch_user_id'});
            if(error) throw error;
          }

          const ref=String(req.cookies?.rewards_ref||'').trim().toLowerCase();
          if(ref&&ref!==String(user.login).toLowerCase()){
            const {data:parent}=await db.from('rewards_users').select('id').eq('twitch_login',ref).maybeSingle();
            if(parent?.id&&parent.id!==me.id){
              const {error:refError}=await db.from('rewards_referrals').insert({referred_user_id:me.id,referrer_user_id:parent.id});
              if(refError&&refError.code!=='23505') console.error('referral_bind_failed',refError);
            }
          }

          res.cookie('rewards_session',encodeSession({twitchUserId:String(user.id),login:String(user.login),displayName:String(user.display_name||user.login),exp:Date.now()+7*86400000}),{httpOnly:true,secure:APP_URL.startsWith('https:'),sameSite:'lax',maxAge:7*86400000});
          res.clearCookie('oauth_state');
          res.clearCookie('rewards_ref');
          return res.redirect('/account');
        }catch(e:any){
          console.error('twitch_oauth_callback_failed',e?.message||e,e);
          return res.status(500).send('Twitch authentication failed');
        }
      };
      return originalGet.call(this,path,fixed);
    }
    return originalGet.call(this,path,...handlers);
  };
}
