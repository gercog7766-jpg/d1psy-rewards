import type {SupabaseClient} from '@supabase/supabase-js';
import type {Request,Response} from 'express';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validDropCatalogChoice(body:any){
 const i=body?.catalogItemId,v=body?.catalogVariantId;
 return (i==null||typeof i==='string'&&uuid.test(i))&&(v==null||typeof v==='string'&&uuid.test(v)&&typeof i==='string'&&uuid.test(i));
}
// Optional during deployment only: older VPS schema can continue legacy draws.
export async function pickShopDrop(db:SupabaseClient,min:number,max:number,item:string|null=null,variant:string|null=null){
 const {data,error}=await db.rpc('rewards_drop_shop_pick',{p_min:min,p_max:max,p_item:item,p_variant:variant,p_allow_finite:true});
 if(error){if(!item&&(error.code==='PGRST202'||error.code==='42883'))return null;throw error;}
 return data&&typeof data.id==='string'&&Number.isInteger(data.sell_price_coins)?data as {id:string,name:string,sell_price_coins:number}:null;
}
export async function searchShopDrops(db:SupabaseClient,req:Request,res:Response,budget=3000){
 res.set('Cache-Control','private,no-store');
 const keys=['q','min','max','wear','kind','page'];
 if(Object.keys(req.query).some(k=>!keys.includes(k)||typeof req.query[k]!=='string'))return res.status(400).json({error:'invalid_search'});
 const q=String(req.query.q||'').trim(),min=Number(req.query.min??2),max=Number(req.query.max??3000),page=Number(req.query.page??0),wear=String(req.query.wear||''),kind=String(req.query.kind||'');
 if(q.length>100||!Number.isInteger(min)||!Number.isInteger(max)||min<2||max>3000||min>max||!Number.isInteger(page)||page<0||page>1000||!['','FN','MW','FT','WW','BS'].includes(wear)||!['','normal','stattrak','souvenir'].includes(kind))return res.status(400).json({error:'invalid_search'});
 const ceiling=Math.min(max,Math.floor(budget));if(ceiling<min)return res.json({items:[],hasMore:false});
 const {data,error}=await db.rpc('rewards_drop_shop_search',{p_query:q,p_min:min,p_max:ceiling,p_wear:wear,p_kind:kind,p_page:page});
 if(error)return res.status(503).json({error:'catalog_unavailable'});
 return res.json(data);
}
