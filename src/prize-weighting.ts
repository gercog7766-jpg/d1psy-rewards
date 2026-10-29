import crypto from 'node:crypto';

export type WeightedPrize={id:string;name:string;draw_weight?:number|null};

export function pickWeightedPrize<T extends WeightedPrize>(prizes:T[]):T{
  if(!prizes.length)throw new Error('no_available_prizes');
  const weighted=prizes.map(prize=>({prize,weight:Number(prize.draw_weight)}));
  if(weighted.some(item=>!Number.isSafeInteger(item.weight)||item.weight<=0))throw new Error('invalid_prize_weight');
  const totalWeight=weighted.reduce((sum,item)=>sum+item.weight,0);
  if(!Number.isSafeInteger(totalWeight)||totalWeight<=0)throw new Error('invalid_total_prize_weight');
  const roll=crypto.randomInt(totalWeight);
  let cursor=0;
  for(const item of weighted){
    cursor+=item.weight;
    if(roll<cursor)return item.prize;
  }
  throw new Error('weighted_prize_selection_failed');
}
