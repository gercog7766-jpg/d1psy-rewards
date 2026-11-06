import {randomInt} from 'node:crypto';
export const DEFUSE_LEVELS={rookie:{name:'Новичок',reward:10,seconds:90,digits:4,symbols:3,signals:3},swat:{name:'Спецназ',reward:20,seconds:60,digits:5,symbols:4,signals:4},expert:{name:'Эксперт',reward:30,seconds:45,digits:6,symbols:5,signals:5}} as const;
export type DefuseDifficulty=keyof typeof DEFUSE_LEVELS;
export function createDefusePuzzles(level:DefuseDifficulty){
 const config=DEFUSE_LEVELS[level];
 const code=Array.from({length:config.digits},()=>String(randomInt(10))).join('');
 const values=new Set<number>();while(values.size<config.symbols)values.add(randomInt(1,100));
 const symbols=['◆','✚','●','▲','■'];const labels=['Ромб','Крест','Круг','Треугольник','Квадрат'];
 const items=[...values].map((value,i)=>({id:String(i),symbol:symbols[i],label:labels[i],value}));
 const sequence=Array.from({length:config.signals},()=>randomInt(4));
 return [{kind:'code',preview:code,length:config.digits,answer:code,previewMs:3000},{kind:'symbols',items,answer:[...items].sort((a,b)=>a.value-b.value).map(x=>x.id).join(''),previewMs:0},{kind:'sequence',sequence,length:config.signals,answer:sequence.join(''),previewMs:config.signals*650+750}];
}
// A response contains only the current task. Answers and request history never leave the server.
export function publicDefuse(raw:any){
 const now=new Date(raw.serverNow).getTime(),g=raw.game;
 if(!g)return {serverNow:raw.serverNow,game:null,canStart:true,nextAvailableAt:null};
 const playing=g.status==='playing'&&Date.parse(g.deadline)>now;
 const task=playing?g.puzzles[g.stage]:null,previewing=playing&&now<Date.parse(g.ready_at);
 const challenge=task?{kind:task.kind,length:task.length||task.items?.length,items:task.kind==='symbols'?task.items:undefined,preview:previewing&&task.kind==='code'?task.preview:undefined,sequence:previewing&&task.kind==='sequence'?task.sequence:undefined}:null;
 return {serverNow:raw.serverNow,canStart:!playing&&now>=Date.parse(g.next_available_at),nextAvailableAt:g.next_available_at,game:{id:g.id,difficulty:g.difficulty,status:playing?'playing':g.status==='playing'?'lost':g.status,stage:g.stage,mistakes:g.mistakes,startedAt:g.started_at,deadline:g.deadline,stageStartedAt:g.stage_started_at,readyAt:g.ready_at,challenge,rewardCoins:g.status==='won'&&g.reward_transaction_id?DEFUSE_LEVELS[g.difficulty as DefuseDifficulty].reward:0}};
}
