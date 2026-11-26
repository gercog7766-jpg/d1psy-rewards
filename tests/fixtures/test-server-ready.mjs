import {setTimeout as delay} from 'node:timers/promises';

// On slower deployment hosts loading the complete tsx server can take more
// than four seconds. Do not continue a test until its own server is healthy.
export async function waitForTestServer(base,child,{timeout=30000}={}){
 const deadline=Date.now()+timeout;let stderr='',last='no response',spawnError=null;
 child.stderr?.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-5000)});
 child.once('error',error=>{spawnError=error});
 while(Date.now()<deadline){
  if(spawnError||child.exitCode!==null||child.signalCode!==null)break;
  try{const response=await fetch(base+'/health',{headers:{Connection:'close'},signal:AbortSignal.timeout(Math.max(1,Math.min(1500,deadline-Date.now())))});const body=await response.json();if(response.ok&&body?.ok===true&&body.service==='d1psy-rewards')return;last='HTTP '+response.status+' / unexpected health response'}catch(error){last=error.cause?.code||error.message||String(error)}
  await delay(100);
 }
 throw Error('Test server did not become healthy: '+base+'; last='+last+'; exit='+child.exitCode+'; signal='+child.signalCode+(spawnError?'; spawn='+spawnError.message:'')+(stderr?'\nChild stderr:\n'+stderr:''));
}
export async function stopTestServer(child){
 if(!child.pid||child.exitCode!==null||child.signalCode!==null)return;
 await new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);resolve()};child.once('exit',done);child.kill('SIGTERM');timer=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL')},3000);if(child.exitCode!==null||child.signalCode!==null)done()});
}
