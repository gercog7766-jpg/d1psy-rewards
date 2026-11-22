import express from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function installAdminGrantsHotfix(){
 const proto=express.application, original=proto.get;
 (proto as any).get=function(path:any,...handlers:any[]){
  if(path==='/admin')handlers=handlers.map(h=>function(req:any,res:any,next:any){const send=res.send.bind(res);res.send=(b:any)=>send(typeof b==='string'?ui(b):b);return h(req,res,next)});
  return (original as any).call(this,path,...handlers);
 };
}
export function installAdminGrantRoutes(app:express.Express,db:SupabaseClient,admin:express.RequestHandler,origin:string){
 const guard:express.RequestHandler=(req,res,next)=>{if(req.get('origin')!==origin||!req.is('application/json')){res.status(403).json({error:'invalid_origin'});return}next()};
 app.get('/api/admin/grants/users',admin,async(req,res)=>{
  const q=String(req.query.q||'').trim().replace(/^@/,'');
  if(!/^[a-z0-9_]{1,25}$/i.test(q))return res.json({users:[]});
  const {data,error}=await db.from('rewards_users').select('id,twitch_login,twitch_display_name').ilike('twitch_login','%'+q.replace(/_/g,'\\_')+'%').order('twitch_login').limit(40);
  res.set('Cache-Control','no-store');if(error)return res.status(500).json({error:'search_failed'});return res.json({users:data||[]});
 });
 app.get('/api/admin/grants/shop',admin,async(req,res)=>{
  const q=String(req.query.q||'').trim(),page=Number(req.query.page||0);
  if(q.length<2||q.length>100||!Number.isSafeInteger(page)||page<0||page>1000)return res.status(400).json({error:'invalid_search'});
  const {data,error}=await db.from('rewards_shop_items').select('id,name,price_coins,stock').eq('status','available').ilike('name','%'+q.replace(/[\\%_]/g,'\\$&')+'%').order('name').order('id').range(page*30,page*30+30);
  if(error)return res.status(500).json({error:'search_failed'});
  const rows=(data||[]).slice(0,30),items:any[]=[];
  if(rows.length){
   const {data:variants,error:ve}=await db.from('rewards_shop_item_variants').select('id,shop_item_id,wear,variant_kind,price_coins,available').in('shop_item_id',rows.map(x=>x.id));
   if(ve)return res.status(500).json({error:'search_failed'});
   for(const row of rows){
    if(row.stock!==null&&row.stock<=0)continue;
    const vs=(variants||[]).filter(v=>v.shop_item_id===row.id);
    if(!vs.length&&row.price_coins>0)items.push({itemId:row.id,variantId:null,name:row.name,price:row.price_coins});
    for(const v of vs)if(v.available&&v.price_coins>0)items.push({itemId:row.id,variantId:v.id,name:row.name,wear:v.wear,kind:v.variant_kind,price:v.price_coins});
   }
  }
  res.set('Cache-Control','no-store');return res.json({items,hasMore:(data||[]).length>30});
 });
 app.post('/api/admin/grants/coins',admin,guard,async(req,res)=>{
  const id=String(req.body?.userId||''),amount=Number(req.body?.amount);
  if(!UUID.test(id)||!Number.isSafeInteger(amount)||amount===0||amount < -100000||amount>100000)return res.status(400).json({error:'invalid_input'});
  const {data:u}=await db.from('rewards_users').select('id').eq('id',id).maybeSingle();
  if(!u)return res.status(404).json({error:'user_not_found'});
  const {error}=await db.from('rewards_coin_transactions').insert({user_id:id,amount,transaction_type:'adjustment',note:amount<0?'Списание администратором':'Начисление администратором'});
  if(error)return res.status(500).json({error:'grant_failed'});return res.json({ok:true});
 });
 app.post('/api/admin/grants/skin',admin,guard,async(req,res)=>{
  const {userId,itemId,variantId,requestId}=req.body||{};
  if(![userId,itemId,requestId].every(x=>typeof x==='string'&&UUID.test(x))||(variantId!==null&&(typeof variantId!=='string'||!UUID.test(variantId))))return res.status(400).json({error:'invalid_input'});
  const {data,error}=await db.rpc('rewards_admin_grant_shop_skin',{p_actor:res.locals.session.twitchUserId,p_user:userId,p_item:itemId,p_variant:variantId,p_request:requestId});
  if(error){console.error('admin_shop_grant_failed',error.code,error.message);return res.status(error.code==='P0001'?400:500).json({error:error.code==='P0001'?error.message:'grant_failed'})}
  return res.json(data);
 });
}
function ui(b:string){
 b=b.replace('<button class="tab" data-page="users">Пользователи</button>','<button class="tab" data-page="users">Пользователи</button><button class="tab" data-page="grants">Начисления</button>');
 b=b.replace('</style>','.grantgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.grantgrid select,.grantgrid input{width:100%;margin:6px 0 12px}@media(max-width:700px){.grantgrid{grid-template-columns:1fr}}</style>');
 return b.replace('<script>(function(){','<section id="page-grants" class="page"><div class="grantgrid"><div class="card"><h2>Начислить скин</h2><label class="muted" for="grantSkinSearch">Пользователь</label><input id="grantSkinSearch" placeholder="Twitch-ник" autocomplete="off"><select id="grantSkinUser"><option value="">Выберите пользователя</option></select><label class="muted" for="grantPrizeSearch">Скин из магазина</label><input id="grantPrizeSearch" placeholder="Название скина или оружия" autocomplete="off"><select id="grantPrize"><option value="">Выберите скин</option></select><button id="grantPrev" type="button" hidden>Назад</button> <button id="grantNext" type="button" hidden>Далее</button><button id="grantSkin" class="primary">Начислить скин</button></div><div class="card"><h2>Начислить / списать Монеты</h2><label class="muted" for="grantCoinSearch">Пользователь</label><input id="grantCoinSearch" placeholder="Twitch-ник" autocomplete="off"><select id="grantCoinUser"><option value="">Выберите пользователя</option></select><label class="muted">Количество (отрицательное — списание)</label><input id="grantCoins" type="number" min="-100000" max="100000" step="1" value="10"><button id="grantCoin" class="primary">Применить Монеты</button></div></div><p id="grantMsg" class="muted" role="status"></p></section><script>(function(){');
}
