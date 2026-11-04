import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {acknowledgeChat} from '../src/eventsub-ack.mjs';

// HTTP-level contract test: real loopback sockets, simulated persistence.
// The SQL transaction itself is covered by verify-atomic-chat.mjs.
async function exercise({atomicEnabled,route}){
 const server=http.createServer((req,res)=>{
   if(req.method!=='POST'||req.url!=='/eventsub/twitch'){res.writeHead(404).end();return;}
   void acknowledgeChat({
     atomicEnabled,route,
     sendStatus:status=>{res.writeHead(status).end();},
     onLegacyError:()=>{}
   });
 });
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 try{
   const address=server.address();
   const response=await fetch(`http://127.0.0.1:${address.port}/eventsub/twitch`,{method:'POST'});
   return response.status;
 }finally{
   server.closeAllConnections();
   await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
}
test('atomic EventSub returns HTTP 204 only on successful persistence',async()=>{
 let persisted=false;
 const status=await exercise({atomicEnabled:true,route:async()=>{await Promise.resolve();persisted=true;}});
 assert.equal(status,204);
 assert.equal(persisted,true);
});
test('atomic EventSub returns HTTP 500 on failed persistence',async()=>{
 const original=console.error;console.error=()=>{};
 try{
   const status=await exercise({atomicEnabled:true,route:async()=>{throw Error('simulated database failure');}});
   assert.equal(status,500);
 }finally{console.error=original;}
});
test('legacy EventSub remains HTTP 204 on asynchronous route error',async()=>{
 const status=await exercise({atomicEnabled:false,route:async()=>{throw Error('simulated legacy failure');}});
 assert.equal(status,204);
});
