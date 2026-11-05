// Pure input validation; used before querying available prize inventory.
export const ROUND_LIMITS=Object.freeze({time:[1,3600],messages:[5,2000],prize:[0,1000]});
export function integerWithin(value,min,max){
 const number=typeof value==='number'?value:typeof value==='string'&&value.trim()?Number(value):NaN;
 return Number.isSafeInteger(number)&&number>=min&&number<=max?number:null;
}
export function validateRoundInput(body={}){
 const mode=body.mode==='messages'?'messages':body.mode==='time'?'time':null;
 if(!mode)return {ok:false,error:'invalid_round_mode'};
 const time=integerWithin(body.intervalSeconds??300,1,3600);
 const messages=integerWithin(body.messageThreshold??100,5,2000);
 const min=integerWithin(body.minPrizeCoins??0,0,1000);
 const max=integerWithin(body.maxPrizeCoins??1000,0,1000);
 if(time===null||messages===null)return {ok:false,error:'invalid_round_limit'};
 if(min===null||max===null||min>max)return {ok:false,error:'invalid_prize_price_range'};
 return {ok:true,mode,interval:time,threshold:messages,min,max};
}
export function prizeInPriceRange(prize,min,max){
 const price=integerWithin(prize?.sell_price_coins,0,1000);
 return prize?.status==='available'&&price!==null&&price>=min&&price<=max;
}
export function shopItemEligible(item,min=0,max=1000){
 const price=integerWithin(item?.price_coins,0,1000);
 return item?.status==='available'&&price!==null&&price>=min&&price<=max&&Number(item.stock)>0;
}
