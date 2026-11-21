export const MAX_DROPSO_LEVEL=100;
export const dropsoRanks=['ROOKIE','EXPLORER','SPECIALIST','VETERAN','ELITE','MASTER','GRANDMASTER','CHAMPION','LEGEND','MYTHIC','DROPSO IMMORTAL'] as const;
export function dropsoThreshold(level:number){
 const l=Math.max(1,Math.min(MAX_DROPSO_LEVEL,Math.trunc(level)));
 if(l<=50)return Math.round(37.5*(l-1)*(l+2));
 if(l<=60){const n=l-50;return 95550+4500*n+150*n*(n-1)}
 if(l<=80){const n=l-60;return 154050+7500*n+250*n*(n-1)}
 const n=l-80;return 399050+17500*n+375*n*(n-1);
}
export function dropsoLevel(xp:number){
 const value=Math.max(0,Number(xp)||0);let lo=1,hi=MAX_DROPSO_LEVEL;
 while(lo<hi){const m=Math.ceil((lo+hi)/2);if(dropsoThreshold(m)<=value)lo=m;else hi=m-1}
 return lo;
}
export function dropsoRank(level:number){return dropsoRanks[Math.min(10,Math.floor(level/10))]}
export function dropsoProgress(xp:number){
 const value=Math.max(0,Number(xp)||0),level=dropsoLevel(value),from=dropsoThreshold(level),to=dropsoThreshold(level+1),maxed=level===MAX_DROPSO_LEVEL;
 return {xp:value,level,rank:dropsoRank(level),levelXp:maxed?0:value-from,nextXp:maxed?0:to-from,remaining:maxed?0:Math.max(0,to-value),maxed};
}
export const dropsoRewards=[
 {level:10,coins:25},{level:20,coins:50},{level:30,coins:100},{level:40,coins:150},{level:50,coins:250},
 {level:60,coins:350,cosmetic:'Уникальная рамка'},{level:70,coins:500,cosmetic:'Фон профиля'},{level:80,coins:750,cosmetic:'Анимированный цвет уровня'},{level:90,coins:1000,cosmetic:'Эксклюзивный титул'},{level:100,coins:1500,cosmetic:'DROPSO IMMORTAL'}
].map(r=>({...r,threshold:dropsoThreshold(r.level),rank:dropsoRank(r.level)}));
