import { createClient } from '@supabase/supabase-js';

// PostgREST responses are capped at 1000 rows by default. Never calculate a
// user's spendable coins from a truncated ledger.
export async function fullCoinBalance(db:ReturnType<typeof createClient>,userId:string):Promise<number>{
 let balance=0;
 for(let offset=0;offset<100000;offset+=500){
  const {data,error}=await db.from('rewards_coin_transactions').select('id,amount').eq('user_id',userId).order('created_at',{ascending:true}).order('id',{ascending:true}).range(offset,offset+499);
  if(error)throw error;
  for(const tx of data||[])balance+=Number(tx.amount||0);
  if((data||[]).length<500)return balance;
 }
 throw new Error('coin_ledger_exceeds_pagination_limit');
}
export async function allCoinBalances(db:ReturnType<typeof createClient>):Promise<Map<string,number>>{
 const balances=new Map<string,number>();
 for(let offset=0;offset<100000;offset+=500){
  const {data,error}=await db.from('rewards_coin_transactions').select('id,user_id,amount').order('created_at',{ascending:true}).order('id',{ascending:true}).range(offset,offset+499);
  if(error)throw error;
  for(const tx of data||[])balances.set(tx.user_id,(balances.get(tx.user_id)||0)+Number(tx.amount||0));
  if((data||[]).length<500)return balances;
 }
 throw new Error('coin_ledger_exceeds_pagination_limit');
}
