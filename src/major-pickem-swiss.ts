// Swiss pairing and difficulty score from Valve's Major supplemental rulebook.
// Stage 1 first-round pairs are ordered by the tournament simulator's initial seed.
export const stageOneSeeds = [
  'nip','parivision','heroic','faze','liquid','100t','eternal-fire','9z',
  'm80','dendele','imperial','wildcard','bcgame','chinggis','flyquest','lynn-vision',
];

export const swissRounds = [
  [['0:0',8]],
  [['1:0',4],['0:1',4]],
  [['2:0',2],['1:1',4],['0:2',2]],
  [['2:1',3],['1:2',3]],
  [['2:2',3]],
] as const;

export const swissBracketScript = String.raw`
const swissRounds = ${JSON.stringify(swissRounds)};
const stageOneSeeds = ${JSON.stringify(stageOneSeeds)};
const sixTeamPriority = ['162534','162435','152634','152436','142635','142536',
  '162345','152346','132645','132546','142356','132456','123645','123546','123456']
  .map(order => order.match(/../g).map(pair => [...pair].map(seed => Number(seed)-1)));

function swissPairs(group) {
  const repeats=(a,b)=>a.opponents.includes(b.id);
  if(group.length===6){
    const options=sixTeamPriority.map(order=>order.map(([a,b])=>[group[a],group[b]]));
    return options.reduce((best,option)=>option.filter(([a,b])=>repeats(a,b)).length
      <best.filter(([a,b])=>repeats(a,b)).length ? option : best);
  }
  // Highest against lowest first. Backtrack if the choice would force a rematch.
  function pair(remaining) {
    if(!remaining.length)return [];
    const [a,...others]=remaining;
    let best=null,bestRepeats=Infinity;
    for(let i=others.length-1;i>=0;i--){
      const b=others[i],tail=pair(others.filter(team=>team!==b));
      const total=Number(repeats(a,b))+tail.filter(([x,y])=>repeats(x,y)).length;
      if(total<bestRepeats){best=[[a,b],...tail];bestRepeats=total;}
      if(total===0)break;
    }
    return best;
  }
  return pair(group);
}

function buildSwiss(firstRound,seeds,picks) {
  const players=new Map(seeds.map((id,i)=>[id,{id,seed:i,w:0,l:0,opponents:[]}]));
  const terminal={};
  const record=team=>team.w+':'+team.l;
  const buchholz=team=>team.opponents.reduce((score,id)=>{
    const opponent=players.get(id);
    return score+opponent.w-opponent.l;
  },0);
  const rounds=[];
  for(let round=0;round<swissRounds.length;round++){
    const previous=rounds[round-1];
    if(previous?.some(match=>!match.winner))break;
    const matches=swissRounds[round].flatMap(([score])=>{
      const pairs=round===0 ? firstRound.map(({a,b,at})=>[players.get(a),players.get(b),at])
        : swissPairs([...players.values()].filter(team=>record(team)===score)
          .sort((a,b)=>buchholz(b)-buchholz(a)||a.seed-b.seed));
      return pairs.map(([a,b,at])=>{
        const id=round+'/'+[a.id,b.id].sort().join('/');
        const winner=picks[id]===a.id||picks[id]===b.id ? picks[id] : null;
        return {id,round,score,a:a.id,b:b.id,at,winner};
      });
    });
    rounds.push(matches);
    for(const match of matches){
      if(!match.winner)continue;
      const loser=match.winner===match.a ? match.b : match.a;
      const a=players.get(match.winner),b=players.get(loser);
      a.w++;b.l++;
      a.opponents.push(b.id);b.opponents.push(a.id);
      if(a.w===3)terminal[a.id]=record(a);
      if(b.l===3)terminal[b.id]=record(b);
    }
  }
  return {rounds,terminal};
}
`;
