import test from 'node:test';
import assert from 'node:assert/strict';
import {allAdminWins,adminInventoryValue} from '../src/admin-users-safe-hotfix.ts';
test('admin inventory reads beyond 1000 history records and excludes spent or delivered items',async()=>{
 const rows=Array.from({length:1501},(_,i)=>({id:i,user_id:'u',choice_status:i<1500?'upgraded':'awaiting_choice',delivery_status:'awaiting_choice',rewards_prizes:{sell_price_coins:285}}));
 const ranges=[];const client={from(){return{select(){return this},order(){return this},async range(a,b){ranges.push([a,b]);return{data:rows.slice(a,b+1),error:null}}}}};
 const all=await allAdminWins(client);assert.equal(all.length,1501);assert.equal(all.reduce((n,w)=>n+adminInventoryValue(w),0),285);assert.equal(ranges.length,4);
 for(const choice_status of ['sold','upgraded','contracted','claimed'])assert.equal(adminInventoryValue({...rows[1500],choice_status}),0);
 assert.equal(adminInventoryValue({...rows[1500],delivery_status:'received'}),0);
 assert.equal(adminInventoryValue({...rows[1500],rewards_prizes:[{sell_price_coins:35}]}),35);
 await assert.rejects(allAdminWins({from(){return{select(){return this},order(){return this},async range(){return{error:new Error('offline')}}}}}),/offline/);
});
