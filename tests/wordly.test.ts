import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dailyPool, grade, moscowDay, nextReset, normalizeGuess, publicGame, DICTIONARY, ANSWER_WORDS, WORDLY_CYCLE_DAYS } from '../src/wordly.js';

test('Moscow reset boundary and next reset',()=>{
 assert.equal(moscowDay(new Date('2026-11-05T20:59:59.999Z')),'2026-11-05');
 assert.equal(moscowDay(new Date('2026-11-05T21:00:00Z')),'2026-11-06');
 assert.equal(nextReset('2026-11-05'),'2026-11-05T21:00:00.000Z');
 assert.equal(moscowDay(new Date('2026-12-31T21:00:00Z')),'2027-01-01');
});
test('31-day rotation uses the supplied bank once per cycle, 31–32 choices per day',()=>{
 const day=(offset:number)=>new Date(Date.parse('2026-11-08T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
 const pools=Array.from({length:WORDLY_CYCLE_DAYS},(_,i)=>dailyPool(day(i),'test-secret'));
 assert.equal(ANSWER_WORDS.length,991);
 assert.equal(new Set(ANSWER_WORDS).size,991);
 assert(pools.every(pool=>pool.length>=31&&pool.length<=32&&pool.every(w=>/^[а-я]{5}$/.test(w)&&DICTIONARY.has(w))));
 assert.equal(new Set(pools.flat()).size,ANSWER_WORDS.length);
 assert.equal(pools.flat().length,ANSWER_WORDS.length);
 for(let i=0;i<WORDLY_CYCLE_DAYS;i++){
  assert.deepEqual(pools[i],dailyPool(day(i),'test-secret'));
  assert.deepEqual(pools[i],dailyPool(day(i+WORDLY_CYCLE_DAYS),'test-secret'));
  assert.deepEqual(pools[i],dailyPool(day(i-WORDLY_CYCLE_DAYS),'test-secret'));
  assert.notDeepEqual(pools[i],dailyPool(day(i+7),'test-secret'));
 }
 assert.notDeepEqual(pools[0],dailyPool(day(0),'different-secret'));
 // Cache replacement/replica restart must not alter the original secret's pool.
 assert.deepEqual(pools[0],dailyPool(day(0),'test-secret'));
 for(const word of ['абзац','актер','греза','дрема','сапер','челка','яства'])assert(ANSWER_WORDS.includes(word));
 for(const word of ['важак','ведьм','дикар'])assert(!ANSWER_WORDS.includes(word));
 for(const word of ['улица','пенал'])assert(DICTIONARY.has(word));
});
test('duplicate letters consume only available occurrences',()=>{
 assert.deepEqual(grade('сосна','насос'),['present','present','correct','present','present']);
 assert.deepEqual(grade('банан','лампа'),['absent','correct','absent','present','absent']);
 assert.deepEqual(grade('маска','масло'),['correct','correct','correct','absent','absent']);
 assert.equal(normalizeGuess(' КОВЁР '),'ковер');
});
test('answer hidden during play; revealed only on win or sixth guess',()=>{
 assert(!('answer' in publicGame({answer:'лампа',guesses:['банан']},'2026-11-05')));
 assert.equal(publicGame({answer:'лампа',guesses:['лампа']},'2026-11-05').status,'won');
 const lost=publicGame({answer:'лампа',guesses:Array(6).fill('банан')},'2026-11-05');
 assert.equal(lost.status,'lost');assert.equal(lost.answer,'лампа');
 assert(!('answer' in publicGame(null,'2026-11-05')));
});

test('paid win reports 25 coins; unfinished, lost and legacy games report zero',()=>{
 assert.equal(publicGame({answer:'лампа',guesses:['лампа'],reward_transaction_id:'paid'},'2026-11-05').rewardCoins,25);
 assert.equal(publicGame({answer:'лампа',guesses:['лампа']},'2026-11-05').rewardCoins,0);
 assert.equal(publicGame({answer:'лампа',guesses:Array(6).fill('банан')},'2026-11-05').rewardCoins,0);
 assert.equal(publicGame(null,'2026-11-05').rewardCoins,0);
});
