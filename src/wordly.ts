import { createHmac } from 'node:crypto';

// Curated five-letter Russian nouns. Ё and Е are treated as the same letter.
export const WORDS = `арбуз банан лимон груша слива перец укроп салат сахар булка батон пирог рулет кефир масло крупа фасад фасон город район
улица адрес берег океан залив ручей песок камыш трава ветка сосна осина скала метла ткань кошка мышка белка олень кабан
баран козёл петух гусак филин чайка цапля книга роман буква слово фраза глава томик ручка доска парта пенал мелок класс
школа стена крыша полка диван лампа свеча ковёр плита печка труба ведро тазик поезд вагон шоссе катер лодка паром
мотор кузов билет брюки кофта носок сапог туфля сумка пакет шляпа берет халат театр сцена актёр балет танец песня
фильм экран время месяц сутки почта марка вечер весна осень среда число эпоха пламя искра дымок мороз ветер гроза туман
холод палец плечо живот спина пятка стопа рубль касса рынок товар налог доход сумма акция замок башня купол тропа овраг
чашка вилка`.split(/\s+/).map(w=>w.replace(/ё/g,'е'));
export const DICTIONARY = new Set(WORDS);
export function moscowDay(now = new Date()) { return new Date(now.getTime()+3*3600000).toISOString().slice(0,10); }
export function nextReset(day: string) { return new Date(Date.parse(day+'T00:00:00+03:00')+86400000).toISOString(); }
export function dailyPool(day: string, _secret: string) {
  // Monday = first group of 20, Sunday = seventh group; repeats weekly.
  const weekday = new Date(day + 'T12:00:00Z').getUTCDay();
  const offset = ((weekday + 6) % 7) * 20;
  return WORDS.slice(offset, offset + 20);
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
  return {day, nextReset:nextReset(day), attempts:6, status:won?'won':finished?'lost':'playing', guesses:guesses.map(word=>({word,marks:grade(word,row.answer)})), ...(finished?{answer:row.answer}:{})};
}
