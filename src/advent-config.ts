// Server-only configuration; never include this catalog in the public page or a client bundle.
export const ADVENT_PRICE=299;
export const ADVENT_START=Date.parse('2026-12-01T00:00:00+03:00');
export const ADVENT_SALE_END=Date.parse('2026-12-11T00:00:00+03:00');
export const ADVENT_CLAIM_END=Date.parse('2027-01-06T00:00:00+03:00');
export const ADVENT_DAY_MS=86_400_000;
export const ADVENT_REWARDS = [
 ['coins',5],['exclusive','snowflake'],['coins',8],['three_doors',10],['coins',5],['exclusive','winter_background'],['skin',25],
 ['coins',10],['coins',5],['exclusive','cold_blood'],['coins',8],['pick_credit',15],['coins',5],['exclusive','winter_frame'],['skin',35],
 ['coins',10],['coins',5],['exclusive','snowfall'],['coins',8],['upgrader_skin',15],['coins',5],['exclusive','winter_banner'],['coins',10],
 ['coins',5],['skin',40],['coins',8],['coins',5],['coins',10],['coins',5],['coins',15],['exclusive','gold_frame'],
] as const;
export function adventAvailableDay(now:number){return Math.max(0,Math.min(31,Math.floor((now-ADVENT_START)/ADVENT_DAY_MS)+1))}
export function adventSaleOpen(now:number){return now<ADVENT_SALE_END}
export function adventClaimOpen(now:number,day:number){return Number.isInteger(day)&&day>=1&&day<=adventAvailableDay(now)&&now<ADVENT_CLAIM_END}
// Nominal issue budget, not an estimate of the games' downstream payouts.
export const ADVENT_NOMINAL_BUDGET=ADVENT_REWARDS.reduce((sum,[,amount])=>sum+(typeof amount==='number'?amount:0),0);
