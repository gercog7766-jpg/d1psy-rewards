import assert from 'node:assert/strict';
import {test} from 'node:test';
import {bronzeCasePrizes,drawBronzeCase} from '../src/major-bronze-case.ts';

test('bronze case has 12 exact prizes and 100 weighted slots',()=>{
  assert.equal(bronzeCasePrizes.length,12);
  assert.equal(bronzeCasePrizes.reduce((sum,item)=>sum+item.weight,0),100);
  assert.deepEqual(bronzeCasePrizes.map(x=>x.weight),[7,10,10,10,10,10,10,10,8,8,5,2]);
  for(const prize of bronzeCasePrizes)assert.equal(
    Array.from({length:100},(_,roll)=>drawBronzeCase(roll)).filter(x=>x===prize).length,prize.weight);
  assert.throws(()=>drawBronzeCase(-1),/invalid_roll/);
  assert.throws(()=>drawBronzeCase(100),/invalid_roll/);
  assert.throws(()=>drawBronzeCase(0.5),/invalid_roll/);
});
