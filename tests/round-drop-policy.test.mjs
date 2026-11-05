import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRoundInput,prizeInPriceRange,shopItemEligible,isOrdinaryFtSkin} from '../src/round-drop-policy.mjs';
test('time limits 1 through 3600 and message limits 5 through 2000',()=>{
 for(const [mode,field,min,max] of [['time','intervalSeconds',1,3600],['messages','messageThreshold',5,2000]]){
  for(const value of [min,max])assert.equal(validateRoundInput({mode,[field]:value}).ok,true);
  for(const value of [min-1,max+1,1.5,NaN,Infinity,'','abc'])assert.equal(validateRoundInput({mode,[field]:value}).ok,false);
 }
});
test('price range rejects reversed, fractional, invalid and over-1000 limits',()=>{
 for(const data of [{minPrizeCoins:1001},{maxPrizeCoins:1001},{minPrizeCoins:50,maxPrizeCoins:49},{maxPrizeCoins:-1},{maxPrizeCoins:'abc'},{maxPrizeCoins:1.5}]){
  assert.equal(validateRoundInput({mode:'time',...data}).ok,false);
 }
 assert.equal(validateRoundInput({mode:'time',minPrizeCoins:0,maxPrizeCoins:1000}).ok,true);
});
test('drop eligibility excludes unavailable prizes and items outside inclusive price bounds',()=>{
 for(const price of [1,999,1000]){
  assert.equal(prizeInPriceRange({status:'available',sell_price_coins:price},0,1000),true);
  assert.equal(shopItemEligible({status:'available',name:'AK-47 | Redline (Field-Tested)',price_coins:price,stock:1}),true);
 }
 assert.equal(prizeInPriceRange({status:'available',sell_price_coins:1001},0,1000),false);
 assert.equal(shopItemEligible({status:'available',name:'AK-47 | Redline (Field-Tested)',price_coins:1001,stock:1}),false);
 assert.equal(shopItemEligible({status:'available',name:'AK-47 | Redline (Field-Tested)',price_coins:999,stock:0}),false);
 assert.equal(shopItemEligible({status:'unavailable',name:'AK-47 | Redline (Field-Tested)',price_coins:999,stock:1}),false);
 assert.equal(prizeInPriceRange({status:'unavailable',sell_price_coins:999},0,1000),false);
 assert.equal(prizeInPriceRange({status:'available',sell_price_coins:5},6,10),false);
});

test('only normal FT variants can be used as shop drop candidates',()=>{
 const base={name:'AK-47 | Redline (Field-Tested)',price_coins:1000,stock:1,status:'available'};
 assert.equal(shopItemEligible(base),true);
 assert.equal(shopItemEligible({...base,name:'AK-47 | Redline (После полевых испытаний)'}),true);
 assert.equal(shopItemEligible({...base,name:'AK-47 | Redline',wear:'FT'}),true);
 for(const name of [
  'StatTrak™ AK-47 | Redline (Field-Tested)',
  'Souvenir AK-47 | Redline (Field-Tested)',
  'AK-47 | Redline (Factory New)',
  'AK-47 | Redline (Minimal Wear)',
  'AK-47 | Redline (Well-Worn)',
  'AK-47 | Redline (Battle-Scarred)',
  'AK-47 | Redline'
 ])assert.equal(shopItemEligible({...base,name}),false,name);
 for(const changes of [{is_stattrak:true},{is_souvenir:true},{wear:'MW'},{variant:'StatTrak'},{type:'Souvenir'}])
  assert.equal(shopItemEligible({...base,...changes}),false,JSON.stringify(changes));
 assert.equal(isOrdinaryFtSkin({name:'Sticker | Example'}),false);
});
