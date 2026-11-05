export declare const ROUND_LIMITS: Readonly<{time:number[];messages:number[];prize:number[]}>;
export declare function integerWithin(value:unknown,min:number,max:number):number|null;
export declare function validateRoundInput(body?:Record<string,unknown>):{ok:true;mode:'time'|'messages';interval:number;threshold:number;min:number;max:number}|{ok:false;error:string};
export declare function prizeInPriceRange(prize:unknown,min:number,max:number):boolean;
export declare function shopItemEligible(item:unknown,min?:number,max?:number):boolean;
