export type UpgradeTarget={variantId:string;itemId:string;name:string;imageUrl:string;wear:string;kind:string;value:number};
export type CatalogQuery={page:number;search:string;min:number;max:number;sort:'asc'|'desc';source:number;mul:number;pct:number};
export const UPGRADE_PAGE_SIZE=36;
// Bound the page cache to the lifetime of the shared price snapshot; no personal data.
const snapshotPages=new WeakMap<readonly UpgradeTarget[],Map<string,ReturnType<typeof computePage>>>();
export function parseUpgradeCatalog(q:Record<string,unknown>):CatalogQuery|null{
 const n=(key:string,def=0)=>q[key]===undefined?def:typeof q[key]==='string'&&/^\d+(\.\d+)?$/.test(q[key] as string)?Number(q[key]):NaN;
 const page=n('page',1),min=n('min'),max=n('max'),source=n('source'),mul=n('mul'),pct=n('pct'),search=q.search===undefined?'':q.search,sort=q.sort??'asc';
 if(!Number.isInteger(page)||page<1||page>100000||typeof search!=='string'||search.length>120||!['asc','desc'].includes(String(sort))||![min,max,source,mul,pct].every(x=>Number.isFinite(x)&&x>=0&&x<=1e12)||mul>100||pct>=90||mul&&pct)return null;
 return {page,min,max,source,mul,pct,search:search.trim().toLowerCase(),sort:sort as 'asc'|'desc'};
}
function computePage(input:readonly UpgradeTarget[],q:CatalogQuery){
 const wanted=q.pct&&q.source?q.source*90/q.pct:0;
 const compare=(a:UpgradeTarget,b:UpgradeTarget)=>((wanted?Math.abs(a.value-wanted)-Math.abs(b.value-wanted):0)||(q.sort==='desc'?b.value-a.value:a.value-b.value)||a.variantId.localeCompare(b.variantId));
 const byItem=new Map<string,UpgradeTarget>();
 for(const x of input){if((q.search&&!x.name.toLowerCase().includes(q.search))||(q.min&&x.value<q.min)||(q.max&&x.value>q.max)||(q.mul&&q.source&&(x.value<q.source*q.mul||x.value>=q.source*(q.mul+1)))||(wanted&&x.value<=q.source))continue;const current=byItem.get(x.itemId);if(!current||compare(x,current)<0)byItem.set(x.itemId,x)}
 const rows=[...byItem.values()].sort(compare),total=rows.length,page=Math.min(q.page,Math.max(1,Math.ceil(total/UPGRADE_PAGE_SIZE)));
 return {targets:rows.slice((page-1)*UPGRADE_PAGE_SIZE,page*UPGRADE_PAGE_SIZE),total,page,pageSize:UPGRADE_PAGE_SIZE};
}
export function pageUpgradeCatalog(input:readonly UpgradeTarget[],q:CatalogQuery){
 let cache=snapshotPages.get(input);if(!cache){cache=new Map();snapshotPages.set(input,cache)}const key=JSON.stringify(q),hit=cache.get(key);if(hit){cache.delete(key);cache.set(key,hit);return hit}const result=computePage(input,q);if(cache.size>=64)cache.delete(cache.keys().next().value!);cache.set(key,result);return result;
}
