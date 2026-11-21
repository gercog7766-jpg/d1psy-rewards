const categories={
 messages:{name:'CHAT MASTER',limits:[100,500,2000,5000],start:744},
 seconds:{name:'STREAM VETERAN',limits:[18000,54000,180000,360000],start:748},
 bosses:{name:'BOSS SLAYER',limits:[1,5,15,50],start:752}
} as const;
type Category=keyof typeof categories;
const ranks=['Бронза','Серебро','Золото','Алмаз'];
const format=(n:number)=>n.toLocaleString('ru-RU');
export function achievementMedal(category:string,tier:number){
 if(!Object.prototype.hasOwnProperty.call(categories,category)||!Number.isInteger(tier)||tier<1||tier>4)return null;
 const c=category as Category,d=categories[c],n=d.limits[tier-1];
 const description=c==='messages'?'За '+format(n)+' сообщений в чате стрима':c==='seconds'?'За '+format(n/3600)+' ч. присутствия на активных эфирах':'За участие в победе над '+format(n)+(n===1?' боссом':' боссами')+' (не менее 150 HP урона каждому)';
 return {title:d.name+' · '+ranks[tier-1],description,image:'/live-boss/'+(d.start+tier-1)+'.webp',category:c,tier};
}
export function achievementMedals(progress:Record<string,unknown>){
 return (Object.keys(categories) as Category[]).flatMap(c=>{const tier=categories[c].limits.filter(n=>Number(progress[c])>=n).length,medal=achievementMedal(c,tier);return medal?[medal]:[]});
}
