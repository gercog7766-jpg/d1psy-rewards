import { createHmac } from 'node:crypto';

// Curated five-letter Russian nouns. Ё and Е are treated as the same letter.
export const WORDS = `арбуз атлас афиша багаж банан банка барон батон белка берег бетон билет биржа бочка букет буква буран вагон валет веник весна ветер вечер вилка вирус вишня волна волос ворон ворох вызов выход газон галка гамма гараж герой город горох гость грань гроза груша дверь дебют девиз декор десна диван дождь доска доход драма дрель дубль дупло дятел завод закон замок запас запах заряд зебра земля зерно зефир злоба знамя зомби игрок идеал износ искра кабан казан казна камин камыш канал канат капля карта каска катер каток кашпо кефир кисть класс книга князь ковёр кожух козёл кокон колос комар конец конёк копия корка котёл кошка кража краса крест крыло крыса крыша кукла кулак кузов купол курок кусок кухня лампа лапша ларец ласка лента лимон линия лодка ложка локон лоток лунка лыжня магия майка маска масло мастер маяк медик месяц мечта мешок миска молот моряк музей мусор набор навес налог народ насос недра нефть нитка номер норка носок нужда обвал облик обман обрез образ овраг огонь океан олива олово олень опера опора осень осина отбор отель отряд пакет палец палка панда папка парик парта парус паста пауза певец пекло пепел перец песня петля петух пилка пилот пирог плата плечо плита плод плоть поезд пожар позор полёт полка порог порох посол почва почта право пресс приём принц проба проза пруд пудра пульс пункт пятно радар радио рамка ранец раунд ребро редис режим резец резон рельс рифма робот ровня рожок роман рояль рубин рубль рулет ручей ручка рывок рынок рюмка салат салон сапог сахар свеча свист связь север седло сезон серия сетка сироп скала склад склон скоба скрип скука слава слеза слово слуга смена смесь смола совок сокол солод сопло сосед сосна сотня спина спорт спрос стадо сталь старт ствол стена степь столб страж струя судно сумка сфера схема сырок табак табло тайна такса танец тариф театр текст тепло терем тесто товар толпа топаз топор тоска трава трата трель тропа труба трусы тыква уголь удача узник уклон укроп улика умник успех утиль ухват факел фанат ферма фикус филин финал фирма фланг флора фокус форма фраза фронт фрукт халат хвост хобот холод хорёк цифра цокот чашка черта чехол число шалаш шапка шахта шёпот школа шляпа шорох шоссе шофёр шпага шпиль шприц шрифт штука щебет щенок экран элита эпоха эскиз юноша юрист ягода якорь ясень яство яхта`.split(/\s+/).map(w=>w.replace(/ё/g,'е')).filter(w=>w.length===5);
export const DICTIONARY = new Set(WORDS);
export function moscowDay(now = new Date()) { return new Date(now.getTime()+3*3600000).toISOString().slice(0,10); }
export function nextReset(day: string) { return new Date(Date.parse(day+'T00:00:00+03:00')+86400000).toISOString(); }
export function dailyPool(day: string, secret: string) {
  return [...DICTIONARY].sort((a,b)=>createHmac('sha256',secret).update(day+':'+a).digest('hex').localeCompare(createHmac('sha256',secret).update(day+':'+b).digest('hex'))).slice(0,15);
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
