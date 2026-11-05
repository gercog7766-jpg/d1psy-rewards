import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dailyPool, grade, moscowDay, nextReset, normalizeGuess, publicGame, DICTIONARY } from '../src/wordly.js';

test('Moscow reset boundary and next reset',()=>{
 assert.equal(moscowDay(new Date('2026-11-05T20:59:59.999Z')),'2026-11-05');
 assert.equal(moscowDay(new Date('2026-11-05T21:00:00Z')),'2026-11-06');
 assert.equal(nextReset('2026-11-05'),'2026-11-05T21:00:00.000Z');
 assert.equal(moscowDay(new Date('2026-12-31T21:00:00Z')),'2027-01-01');
});
test('20 unique valid words daily; seven distinct weekday pools',()=>{
 const pool=dailyPool('2026-11-05','test-secret');
 assert.equal(new Set(pool).size,20);
 assert(pool.every(x=>/^[а-я]{5}$/.test(x)&&DICTIONARY.has(x)));
 assert.deepEqual(pool,dailyPool('2026-11-05','test-secret'));
 assert.notDeepEqual(pool,dailyPool('2026-11-06','test-secret'));
 assert.deepEqual(pool,dailyPool('2026-11-12','test-secret'));
 assert.equal(new Set(Array.from({length:7},(_,i)=>dailyPool(`2026-11-${String(9+i).padStart(2,'0')}`,'test-secret')).flat()).size,140);
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
