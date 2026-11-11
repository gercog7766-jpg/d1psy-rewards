import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {installObsHotfix} from '../src/obs-hotfix.ts';

test('OBS Connect page is registered and serves the transparent winner overlay',async()=>{
 const proto=express.application,original=proto.get;
 let app;
 try{
  installObsHotfix();
  app=express();
  app.get('/health',(_q,r)=>r.json({ok:true}));
  proto.get=original;
  const server=app.listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));
  try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/obs/connect');
   assert.equal(response.status,200);
   const html=await response.text();
   assert(html.includes('Дроп получит'));
   assert(html.includes('За событие'));
   assert(html.includes('/api/public/connect/state'));
   assert((response.headers.get('cache-control')||'').includes('no-store'));
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
 }finally{proto.get=original}
});
