import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ADVENT_REWARDS,ADVENT_START,ADVENT_SALE_END,ADVENT_CLAIM_END,ADVENT_NOMINAL_BUDGET,adventAvailableDay,adventClaimOpen,adventSaleOpen} from '../src/advent-config.ts';
import {adventHtml,adventAccountBanner} from '../src/advent-ui.ts';
test('calendar has exactly 31 fixed rewards and seven cosmetics in approved order',()=>{
 assert.equal(ADVENT_REWARDS.length,31);
 assert.deepEqual(ADVENT_REWARDS.flatMap(([kind],i)=>kind==='exclusive'?[i+1]:[]),[2,6,10,14,18,22,31]);
 assert.deepEqual(ADVENT_REWARDS[29],['coins',15]);
 assert.equal(ADVENT_NOMINAL_BUDGET,272);
});
test('December date boundaries and inclusive sale and catch-up periods',()=>{
 assert.equal(adventAvailableDay(ADVENT_START-1),0);
 assert.equal(adventAvailableDay(ADVENT_START),1);
 assert.equal(adventAvailableDay(ADVENT_START+30*86400000),31);
 assert.equal(adventSaleOpen(ADVENT_SALE_END-1),true);
 assert.equal(adventSaleOpen(ADVENT_SALE_END),false);
 assert.equal(adventClaimOpen(ADVENT_CLAIM_END-1,1),true);
 assert.equal(adventClaimOpen(ADVENT_CLAIM_END,1),false);
 assert.equal(adventClaimOpen(ADVENT_START,2),false);
});
test('public preview reveals no future rewards or monetary budget',()=>{
 assert.equal((adventHtml.match(/class="day"/g)||[]).length,31);
 assert.doesNotMatch(adventHtml,/snowflake|winter_background|gold_frame|272|МСК/);
 assert.match(adventAccountBanner,/class="seasonAccountHero adventAccountHero" href="\/advent"/);
});
