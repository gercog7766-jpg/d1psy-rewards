// Version 1 stays compatible with in-flight runs. Version 2 uses swept world-space collisions.
export const nightRunCore=String.raw`(function(){
const ROW=1000,HIT_HALF=480,PICKUP_HALF=380,BODY_WIDTH=.32,OBSTACLE_WIDTH=.64;
function hash(seed,row){return ((seed+row*48271)%2147483647*16807)%2147483647}
function blocks(seed,row){if(row<3||row%50===0)return [];var n=hash(seed,row);return row>35&&n%5===0?[n%3,(n+1)%3]:[n%3]}
function speed(tick){return 80+Math.min(60,Math.floor(Math.max(0,tick-1)/20))}
function distanceAt(tick){const n=Math.max(0,Math.floor(tick)),k=Math.min(60,Math.floor(n/20));return 20*(80*k+k*(k-1)/2)+(n-20*k)*(80+k)}
function coinGap(seed,index){return 300+hash(seed+777,index)%151}
function initialV2(seed){return {version:2,seed:seed,tick:0,lane:1,position:1000,distance:0,coins:0,status:'playing',coin_index:1,next_coin_tick:coinGap(seed,1),last_coin_tick:0}}
function blocksFor(g,row){if(g.version!==2)return blocks(g.seed,row);const d=row*ROW;if(row<3||Math.abs(d-distanceAt(g.next_coin_tick))<=700||(g.last_coin_tick>0&&Math.abs(d-distanceAt(g.last_coin_tick))<=700))return [];const n=hash(g.seed,row);return row>35&&n%5===0?[n%3,(n+1)%3]:[n%3]}
function position(g){return g.version===2?g.position:g.lane*1000}
function progress(g){return g.version===2?g.distance:g.tick*ROW/12}
function advanceX(x,target,fraction=1){return x+Math.sign(target*1000-x)*Math.min(Math.abs(target*1000-x),500*fraction)}
function project(position,delta,w,h){const p=1-delta/6000,z=p*p,spacing=w*(.06+.23*z);return {x:w*.5+(position/1000-1)*spacing,y:h*.26+z*h*.62,z:z,spacing:spacing}}
function step(s,target){if(s.status!=='playing')return s;var g=Object.assign({},s);g.tick++;
 if(g.version!==2){g.lane+=Math.sign(target-g.lane);if(g.tick%12===0&&blocks(g.seed,g.tick/12).includes(g.lane))g.status='crashed';else if(g.tick%600===0&&g.lane===hash(g.seed+999,g.tick/600)%3)g.coins++;return g}
 const oldD=g.distance,oldX=g.position,v=speed(g.tick),newX=advanceX(oldX,target);g.distance+=v;g.position=newX;g.lane=Math.floor(newX/1000+.5);
 for(let row=Math.floor(oldD/ROW)+1;row<=Math.floor(g.distance/ROW);row++){const crossing=row*ROW-oldD;for(const lane of blocksFor(g,row)){if(Math.abs((oldX-lane*1000)*v+(newX-oldX)*crossing)<HIT_HALF*v){g.status='crashed';g.distance=row*ROW;g.position=Math.floor(oldX+(newX-oldX)*crossing/v+.5);g.lane=Math.floor(g.position/1000+.5);return g}}}
 if(g.tick===g.next_coin_tick){if(Math.abs(g.position-hash(g.seed+999,g.coin_index)%3*1000)<=PICKUP_HALF)g.coins++;g.last_coin_tick=g.next_coin_tick;g.coin_index++;g.next_coin_tick+=coinGap(g.seed,g.coin_index)}return g
}
return {hash:hash,blocks:blocks,blocksFor:blocksFor,step:step,speed:speed,distanceAt:distanceAt,coinGap:coinGap,initialV2:initialV2,position:position,progress:progress,advanceX:advanceX,project:project,BODY_WIDTH:BODY_WIDTH,OBSTACLE_WIDTH:OBSTACLE_WIDTH,ROW:ROW,HIT_HALF:HIT_HALF,PICKUP_HALF:PICKUP_HALF};})()`;
