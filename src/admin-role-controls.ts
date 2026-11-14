import type {Express, RequestHandler} from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';

export async function isDropsoAdmin(db: SupabaseClient, actor: string) {
  const {data,error}=await db.from('rewards_admins').select('twitch_user_id')
    .eq('twitch_user_id',actor).maybeSingle();
  if(error)throw error;
  return Boolean(data);
}

export async function isDropsoOwner(db: SupabaseClient, actor: string) {
  const {data,error}=await db.from('rewards_streamers').select('twitch_broadcaster_id')
    .eq('twitch_broadcaster_id',actor).eq('is_primary',true).maybeSingle();
  if(error)throw error;
  return Boolean(data);
}

export function installAdminRoleControls(app: Express, db: SupabaseClient, user: RequestHandler, admin: RequestHandler, origin: string) {
  for(const path of ['/api/black-box/bid','/api/blind-final/:action','/api/me/guess-word/guess']){
    app.post(path,user,async(q,r,next)=>{
      if(q.params.action&&!['enter','pick'].includes(String(q.params.action)))return next();
      r.set('Cache-Control','no-store');
      try{
        if(await isDropsoAdmin(db,r.locals.session.twitchUserId))
          return void r.status(403).json({error:'admin_cannot_play'});
        next();
      }catch{
        r.status(503).json({error:'admin_lookup_failed'});
      }
    });
  }

  app.post('/api/admin/users/:id/admin-role',admin,async(q,r)=>{
    r.set('Cache-Control','no-store');
    if(q.get('origin')!==origin||!q.is('application/json'))return r.sendStatus(403);
    if(typeof q.body?.enabled!=='boolean'||Object.keys(q.body).length!==1||
      typeof q.params.id!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(q.params.id))return r.sendStatus(400);

    try{
      if(!await isDropsoOwner(db,r.locals.session.twitchUserId))return r.sendStatus(403);
      const {data:target,error:lookup}=await db.from('rewards_users').select('twitch_user_id,banned')
        .eq('id',q.params.id).maybeSingle();
      if(lookup)throw lookup;
      if(!target)return r.sendStatus(404);
      if(await isDropsoOwner(db,target.twitch_user_id)||(q.body.enabled&&target.banned))return r.sendStatus(409);
      const result=q.body.enabled
        ?await db.from('rewards_admins').upsert({twitch_user_id:target.twitch_user_id},{onConflict:'twitch_user_id',ignoreDuplicates:true})
        :await db.from('rewards_admins').delete().eq('twitch_user_id',target.twitch_user_id);
      if(result.error)throw result.error;
      return r.json({ok:true});
    }catch{
      return r.status(503).json({error:'admin_role_unavailable'});
    }
  });
}
