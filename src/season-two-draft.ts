/** S2 proposal only. No S1 task, claim, wallet or inventory code is changed. */
export type DraftSeasonReward={kind:'coins'|'skin'|'title'|'frame'|'background'|'badge'|'other';label:string;value:number};
const coinWord=(value:number)=>value%100>=11&&value%100<=14?'монет':value%10===1?'монета':value%10>=2&&value%10<=4?'монеты':'монет';
const coins=(value:number):DraftSeasonReward=>({kind:'coins',label:`${value} ${coinWord(value)}`,value});
const skin=(value:number,label=`Фиксированный скин · бюджет ${value} монет`):DraftSeasonReward=>({kind:'skin',label,value});
const cosmetic=(kind:DraftSeasonReward['kind'],label:string):DraftSeasonReward=>({kind,label,value:0});
// Exact skin variants will be selected by the owner before publication, not randomly drawn.
const rows:[DraftSeasonReward,DraftSeasonReward][]=[
 [coins(2),coins(5)], // 1
 [coins(3),coins(6)],
 [coins(3),skin(12)],
 [coins(4),coins(8)],
 [skin(10),cosmetic('badge','S2 · Premium Recruit')], // 5
 [coins(4),coins(10)],
 [coins(5),skin(18)],
 [skin(12),coins(12)],
 [coins(5),skin(22)],
 [cosmetic('title','Ночной патруль'),skin(30)], // 10
 [coins(6),coins(15)],
 [skin(15),skin(35)],
 [coins(7),coins(18)],
 [coins(7),skin(40)],
 [skin(20),cosmetic('title','Night Operator')], // 15
 [coins(8),coins(20)],
 [skin(25),skin(45)],
 [coins(8),coins(22)],
 [skin(30),skin(50)],
 [cosmetic('badge','S2 · Ночная смена'),cosmetic('frame','S2 · Неоновый контур')], // 20
 [coins(10),coins(25)],
 [skin(35),skin(60)],
 [coins(12),coins(30)],
 [skin(40),skin(70)],
 [skin(45),cosmetic('background','S2 · Неоновый город')], // 25
 [coins(14),coins(35)],
 [skin(50),skin(80)],
 [coins(15),coins(40)],
 [skin(55),skin(90)],
 [cosmetic('frame','S2 · Лунная рамка'),skin(110)], // 30
 [coins(17),coins(45)],
 [skin(60),skin(120)],
 [coins(18),coins(50)],
 [skin(65),skin(140)],
 [skin(75),cosmetic('title','Midnight Elite')], // 35
 [coins(20),coins(55)],
 [skin(80),skin(160)],
 [coins(22),coins(60)],
 [skin(90),skin(180)],
 [cosmetic('background','S2 · Ночной дозор'),cosmetic('frame','S2 · Анимированная полярная рамка')], // 40
 [coins(25),coins(65)],
 [skin(100),skin(200)],
 [coins(28),coins(70)],
 [skin(110),skin(220)],
 [skin(120),cosmetic('badge','S2 · Elite')], // 45
 [coins(30),coins(80)],
 [skin(130),skin(250)],
 [coins(35),cosmetic('background','S2 · Золотое затмение')],
 [skin(150),skin(300)],
 [skin(550,'Фиксированный скин · 500–600 монет (цель 550)'),skin(2500,'Фиксированные перчатки · около 2500 монет')], // 50
];
// Keep routine rewards modest: the two final skins are the season's headline.
function budgeted(reward:DraftSeasonReward,factor:number){
 if(reward.kind==='coins')return coins(Math.max(2,Math.round(reward.value*factor)));
 if(reward.kind==='skin')return skin(Math.max(5,Math.round(reward.value*factor/5)*5));
 return {...reward};
}
export function seasonTwoRewardDraft(){return rows.map(([free,premium],i)=>i===49?{free:{...free},premium:{...premium}}:{free:budgeted(free,.65),premium:budgeted(premium,.55)});}

// 90 days = 12 complete 7-day windows and one 6-day closing window.
// 8.5/9 * 13 = 110.5, rounded up to 111; each window must have >=8 tasks.
export const seasonTwoRules={days:90,weeks:13,weeklyTasks:9,minWeeklyEach:8,minWeeklyTotal:111,challengeMonths:3,challengesPerMonth:3,spPerDailySet:100,spPerWeekly:100,spPerChallenge:1000,maxLevel:50,finalSp:29100} as const;
export const seasonTwoCosts=Array.from({length:50},(_,i)=>[250,400,600,750,910][Math.floor(i/10)]);
export const seasonTwoThresholds=seasonTwoCosts.map((_,i)=>seasonTwoCosts.slice(0,i+1).reduce((a,b)=>a+b,0));
export function seasonTwoProgress(dailyCompleted:number,weeklyCompleted:number[],challengesCompleted:number[]){
 if(!Number.isInteger(dailyCompleted)||dailyCompleted<0||dailyCompleted>90||weeklyCompleted.length!==13||weeklyCompleted.some(x=>!Number.isInteger(x)||x<0||x>9)||challengesCompleted.length!==3||challengesCompleted.some(x=>!Number.isInteger(x)||x<0||x>3))throw Error('invalid_s2_progress');
 const weekly=weeklyCompleted.reduce((a,b)=>a+b,0),challenges=challengesCompleted.reduce((a,b)=>a+b,0),sp=dailyCompleted*100+weekly*100+challenges*1000;
 const eligible=dailyCompleted===90&&weekly>=111&&weeklyCompleted.every(x=>x>=8)&&challengesCompleted.every(x=>x===3);
 const rawLevel=seasonTwoThresholds.filter(x=>x<=sp).length,level=eligible?rawLevel:Math.min(rawLevel,49);
 return {sp,level,eligible,weekly,challenges,remainingDaily:90-dailyCompleted,remainingWeekly:Math.max(0,111-weekly),remainingChallenges:9-challenges};
}
