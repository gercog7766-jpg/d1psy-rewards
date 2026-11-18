// The server owns the draw. Never expose weights in player-facing responses.
export const bronzeCasePrizes = [
  {name:'AK-47 | Оливковый поликамуфляж', wear:'FT', weight:7},
  {name:'Five-SeveN | Небесная голубизна', wear:'FT', weight:10},
  {name:'P250 | Ледяная корка', wear:'FT', weight:10},
  {name:'SG 553 | Корзинные полутона', wear:'FT', weight:10},
  {name:'SCAR-20 | Песчаная сетка', wear:'FT', weight:10},
  {name:'M249 | Ледяная корка', wear:'FT', weight:10},
  {name:'Негев | Кислый виноград', wear:'BS', weight:10},
  {name:'XM1014 | Ирэдзуми', wear:'BS', weight:10},
  {name:'ПП-19 «Бизон» | Карамельное яблоко', wear:'FT', weight:8},
  {name:'MAC-10 | Световой короб', wear:'FT', weight:8},
  {name:'Five-SeveN | Капилляры', wear:'FT', weight:5},
  {name:'CZ75-Auto | Эко', wear:'FT', weight:2},
] as const;

export function drawBronzeCase(roll:number) {
  if(!Number.isInteger(roll)||roll<0||roll>=100)throw Error('invalid_roll');
  let cumulative=0;
  for(const prize of bronzeCasePrizes){
    cumulative+=prize.weight;
    if(roll<cumulative)return prize;
  }
  throw Error('invalid_weights');
}
