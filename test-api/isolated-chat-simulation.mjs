// Volatile, read-only-to-database simulation. Never calls giveaway or prize APIs.
export const STREAMS=Object.freeze({d1psy_off:'511100980',amych:'39780903'});
const LIMIT=1000;
export function createChatSimulation({threshold=10}={}){
 const state=new Map(Object.entries(STREAMS).map(([login,broadcaster_id])=>[broadcaster_id,{login,broadcaster_id,round:1,progress:0,total:0,completed:0,last_event_at:null}]));
 const seen=new Set();
 return {
  record({broadcasterId,messageId,at=new Date().toISOString()}){
   const stream=state.get(broadcasterId);
   if(!stream||typeof messageId!=='string'||messageId.length<1||messageId.length>256)return false;
   const key=broadcasterId+':'+messageId;
   if(seen.has(key))return false;
   if(seen.size>=LIMIT)seen.clear(); // Bounded memory; counters are illustrative only.
   seen.add(key);stream.total++;stream.progress++;stream.last_event_at=at;
   if(stream.progress>=threshold){stream.completed++;stream.round++;stream.progress=0;}
   return true;
  },
  snapshot(){return {mode:'in_memory_simulation',threshold,database_writes:false,giveaway_processing:false,streams:Array.from(state.values(),s=>({...s}))};}
 };
}
export const chatSimulation=createChatSimulation();
