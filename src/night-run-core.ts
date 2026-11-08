// Integer, fixed-step simulation; the database replays these same lane inputs.
export const nightRunCore=String.raw`(function(){
function hash(seed,row){return ((seed+row*48271)%2147483647*16807)%2147483647}
function blocks(seed,row){if(row<3||row%50===0)return [];var n=hash(seed,row);return row>35&&n%5===0?[n%3,(n+1)%3]:[n%3]}
function step(s,target){if(s.status!=='playing')return s;var g=Object.assign({},s);g.tick++;g.lane+=Math.sign(target-g.lane);if(g.tick%12===0&&blocks(g.seed,g.tick/12).includes(g.lane))g.status='crashed';else if(g.tick%600===0&&g.lane===hash(g.seed+999,g.tick/600)%3)g.coins++;return g}
return {hash:hash,blocks:blocks,step:step};})()`;
