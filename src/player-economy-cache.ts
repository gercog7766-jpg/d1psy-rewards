// Per-process, per-user snapshots; never shared between accounts or DB clients.
export function createStatisticsLoader(db:any,clock=Date.now){
 const base=new Map<string,{until:number,promise:Promise<any>}>(),economy=new Map<string,{until:number,promise:Promise<any>}>();
 function cached(cache:typeof base,key:string,load:()=>Promise<any>){
  let entry=cache.get(key);if(entry&&entry.until>clock())return entry.promise;
  entry={until:clock()+30000,promise:Promise.resolve().then(load)};cache.set(key,entry);
  const current=entry;current.promise=current.promise.catch(error=>{if(cache.get(key)===current)cache.delete(key);throw error});
  if(cache.size>1000)cache.delete(cache.keys().next().value!);return current.promise;
 }
 async function rpc(name:string,body:any){const {data,error}=await db.rpc(name,body);if(error)throw error;return data}
 return async(user:string,page:number)=>{const [s,story]=await Promise.all([cached(base,user+':'+page,()=>rpc('rewards_player_statistics',{p_user:user,p_page:page})),cached(economy,user,()=>rpc('rewards_player_economy',{p_user:user}))]);return structuredClone({...s,economy:story})};
}
