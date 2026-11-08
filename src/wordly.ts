import { createHmac } from 'node:crypto';
import { SUPPLIED_WORDS } from './wordly-words.js';

// Preserve the original bank for existing games and accepted spellings.
const LEGACY_WORDS = `арбуз банан лимон груша слива перец укроп салат сахар булка батон пирог рулет кефир масло крупа фасад фасон город район
улица адрес берег океан залив ручей песок камыш трава ветка сосна осина скала метла ткань кошка мышка белка олень кабан
баран козёл петух гусак филин чайка цапля книга роман буква слово фраза глава томик ручка доска парта пенал мелок класс
школа стена крыша полка диван лампа свеча ковёр плита печка труба ведро тазик поезд вагон шоссе катер лодка паром
мотор кузов билет брюки кофта носок сапог туфля сумка пакет шляпа берет халат театр сцена актёр балет танец песня
фильм экран время месяц сутки почта марка вечер весна осень среда число эпоха пламя искра дымок мороз ветер гроза туман
холод палец плечо живот спина пятка стопа рубль касса рынок товар налог доход сумма акция замок башня купол тропа овраг
чашка вилка`.split(/\s+/).map(w=>w.replace(/ё/g,'е'));
// These supplied forms remain out of the answer bank pending review.
const REVIEW_WORDS = new Set(['важак', 'ведьм', 'дикар']);
export const ANSWER_WORDS = [...new Set(SUPPLIED_WORDS.map(w=>w.replace(/ё/g,'е')))]
  .filter(w=>/^[а-я]{5}$/.test(w)&&!REVIEW_WORDS.has(w));
export const WORDS = [...new Set([...LEGACY_WORDS,...ANSWER_WORDS])];
export const DICTIONARY = new Set(WORDS);
export const WORDLY_CYCLE_DAYS = 31;
const CYCLE_START = Date.parse('2026-11-08T00:00:00Z');
let cachedSecret: string | undefined;
let orderedAnswers: string[] = [];
export function moscowDay(now = new Date()) { return new Date(now.getTime()+3*3600000).toISOString().slice(0,10); }
export function nextReset(day: string) { return new Date(Date.parse(day+'T00:00:00+03:00')+86400000).toISOString(); }
export function dailyPool(day: string, secret: string) {
  // One deterministic shuffled bank per server secret, shared by all replicas.
  // Partition it evenly: every answer appears on exactly one of the 31 days.
  if(cachedSecret!==secret) {
    orderedAnswers=ANSWER_WORDS.map(word=>({word,key:createHmac('sha256',secret).update('wordly-month-v1:'+word).digest('hex')}))
      .sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0).map(entry=>entry.word);
    cachedSecret=secret;
  }
  const elapsed=Math.floor((Date.parse(day+'T00:00:00Z')-CYCLE_START)/86400000);
  const index=((elapsed%WORDLY_CYCLE_DAYS)+WORDLY_CYCLE_DAYS)%WORDLY_CYCLE_DAYS;
  return orderedAnswers.slice(Math.floor(index*orderedAnswers.length/WORDLY_CYCLE_DAYS),Math.floor((index+1)*orderedAnswers.length/WORDLY_CYCLE_DAYS));
}
export function normalizeGuess(value: unknown) { return typeof value==='string'?value.trim().toLowerCase().replace(/ё/g,'е'):''; }
export function grade(guess: string, answer: string) {
  const result = Array<string>(5).fill('absent'), remaining = answer.split('');
  for(let i=0;i<5;i++) if(guess[i]===answer[i]) { result[i]='correct'; remaining[i]=''; }
  for(let i=0;i<5;i++) if(result[i]!=='correct') { const index=remaining.indexOf(guess[i]); if(index!==-1) {result[i]='present';remaining[index]='';} }
  return result;
}
export function publicGame(row: any, day: string) {
  const guesses: string[] = row?.guesses || [];
  const won = !!row && guesses.includes(row.answer), finished = won || guesses.length>=6;
  return {...(row?.started_at?{startedAt:row.started_at,finishedAt:row.finished_at||null,timingEligible:row.timing_eligible===true}:{}),day, rewardCoins:won&&row?.reward_transaction_id?25:0, nextReset:nextReset(day), attempts:6, status:won?'won':finished?'lost':'playing', guesses:guesses.map(word=>({word,marks:grade(word,row.answer)})), ...(finished?{answer:row.answer}:{})};
}
