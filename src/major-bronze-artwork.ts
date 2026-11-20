import {createHash} from 'node:crypto';

// Only the fixed Steam image CDN and its economy image path may be fetched.
const hosts=new Set(['community.steamstatic.com','community.akamai.steamstatic.com','community.cloudflare.steamstatic.com','steamcdn-a.akamaihd.net']);
const types=new Set(['image/png','image/jpeg','image/webp','image/gif']);
const maxBytes=1024*1024;
export function bronzeSteamImage(value:unknown):string|null{
 if(typeof value!=='string'||value.length>1600)return null;
 try{const u=new URL(value);if(u.protocol!=='https:'||u.port||u.username||u.password||!hosts.has(u.hostname)||u.search||u.hash||!/^\/economy\/image\/[A-Za-z0-9_-]+(?:\/\d{1,4}x\d{1,4})?$/.test(u.pathname))return null;return u.href}catch{return null}
}
type Artwork={type:string;body:Buffer};
export class BronzeArtworkCache{
 private sources=new Map<string,{url:string,expires:number}>();
 private images=new Map<string,{image:Artwork,expires:number}>();
 private pending=new Map<string,Promise<Artwork|null>>();
 constructor(private readonly request:typeof fetch=fetch){}
 decorate(items:unknown){
  if(!Array.isArray(items))return items;
  return items.map(item=>{
   const url=bronzeSteamImage(item?.image);if(!url)return item;
   const key=createHash('sha256').update(url).digest('hex').slice(0,32);
   this.sources.delete(key);this.sources.set(key,{url,expires:Date.now()+3600000});
   while(this.sources.size>48)this.sources.delete(this.sources.keys().next().value!);
   return {...item,proxy:'/api/me/major-pickem/cases/bronze/art/'+key};
  });
 }
 async get(key:string):Promise<Artwork|null>{
  if(!/^[a-f0-9]{32}$/.test(key))return null;
  const source=this.sources.get(key);if(!source||source.expires<=Date.now())return null;
  const saved=this.images.get(key);if(saved&&saved.expires>Date.now())return saved.image;
  if(this.pending.has(key))return this.pending.get(key)!;
  if(this.pending.size>=16)return null;
  const job=this.fetchImage(source.url).then(image=>{
   if(image){this.images.delete(key);this.images.set(key,{image,expires:Date.now()+3600000});while(this.images.size>24)this.images.delete(this.images.keys().next().value!)}
   return image;
  }).finally(()=>this.pending.delete(key));
  this.pending.set(key,job);return job;
 }
 private async fetchImage(url:string):Promise<Artwork|null>{
  try{
   const response=await this.request(url,{redirect:'error',signal:AbortSignal.timeout(3500),headers:{Accept:'image/webp,image/png,image/jpeg,image/gif'}});
   const type=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()||'';
   if(!response.ok||!types.has(type)||!response.body||Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel();return null}
   const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();return null}chunks.push(value)}
   return size?{type,body:Buffer.concat(chunks)}:null;
  }catch{return null}
 }
}
