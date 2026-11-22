// PostgREST caps individual responses. Keep the full catalog visible and stable.
export async function catalogPages(makeQuery:()=>any,concurrency=1):Promise<{data:any[];error:any}>{
 const data:any[]=[];
 const width=Math.max(1,Math.min(4,Math.floor(concurrency)||1));
 for(let offset=0;offset<1000000;){
  const count=offset===0?1:width;
  const results=await Promise.all(Array.from({length:count},(_,i)=>makeQuery().order('id',{ascending:true}).range(offset+i*500,offset+i*500+499)));
  for(const result of results){if(result.error)return {data:[],error:result.error};const rows=result.data||[];data.push(...rows);if(rows.length<500)return {data,error:null}}
  offset+=count*500;
 }
 return {data:[],error:new Error('catalog_too_large')};
}
