// PostgREST caps individual responses. Keep the full catalog visible and stable.
export async function catalogPages(makeQuery:()=>any):Promise<{data:any[];error:any}>{
 const data:any[]=[];for(let offset=0;offset<1000000;offset+=500){const result=await makeQuery().order('id',{ascending:true}).range(offset,offset+499);if(result.error)return {data:[],error:result.error};const rows=result.data||[];data.push(...rows);if(rows.length<500)return {data,error:null};}return {data:[],error:new Error('catalog_too_large')};
}
