import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {normalizeIhaqEvent,startBossIhaq,bossIhaqStatus} from '../src/live-boss-ihaq.ts';
const id='12345678-1234-1234-1234-123456789abc',code='82345678-1234-1234-1234-123456789abc';
const row={type:'donation',message:{id,typeId:1,amount:'100.00',message:'[DROPSO:'+code+']',currency:'rub',donatorName:'Alpha'}};
test('documented iHAQ message is normalized while other events, bad currency, invalid amount and test notices are ignored',()=>{
 const at=new Date().toISOString();
 assert.deepEqual(normalizeIhaqEvent(row,at),{p_event:id,p_donor:'Alpha',p_rub:100,p_code:code,p_at:at});
 assert.equal(normalizeIhaqEvent({...row,type:'notification'}),null);
 assert.equal(normalizeIhaqEvent({...row,message:{...row.message,currency:'USD'}}),null);
 assert.equal(normalizeIhaqEvent({...row,message:{...row.message,amount:'1e6'}}),null);
 assert.equal(normalizeIhaqEvent({...row,message:{...row.message,isTest:true}}),null);
});
test('iHAQ socket uses documented path, polling fallback and serializes incoming donations to the database',async()=>{
 const events=new EventEmitter(),calls=[];events.connect=()=>{events.emit('connect');return events};
 const db={rpc(name,args){calls.push({name,args});return Promise.resolve({error:null})}};
 const token='01234567-0123-0123-0123-0123456789ab';
 let options;
 const socket=startBossIhaq(db,token,(url,o)=>{assert.equal(url,'wss://ihaqdonate.com');options=o;return events});
 assert.equal(socket,events);assert.equal(options.path,'/ws/integrations/socket.io/v1/'+token);assert.deepEqual(options.transports,['polling','websocket']);assert.equal(bossIhaqStatus().status,'connected');
 events.emit('message',row);events.emit('message',{...row,type:'other'});
 for(let i=0;i<30&&!calls.length;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(calls.length,1);assert.equal(calls[0].name,'rewards_boss_ihaq_event');assert.equal(calls[0].args.p_rub,100);assert(!JSON.stringify(calls).includes(token));
 events.emit('disconnect');assert.equal(bossIhaqStatus().status,'disconnected');
});
