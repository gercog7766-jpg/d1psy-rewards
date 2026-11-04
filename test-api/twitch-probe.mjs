// Isolated, read-only EventSub probe. No Twitch subscriptions and no DB writes.
// Run separately from the production application.
import http from 'node:http';
import {Pool} from 'pg';
import {verifyEventSubMessage} from '../src/eventsub-signature.mjs';
import {validChatNotification} from '../src/eventsub-payload.mjs';

const expectedDb='d1psy_multistream_test_db';
const expectedBroadcaster='39780903';
export function probeConfig(env){
 try{
  const parsed=new URL(env.DATABASE_URL||'');
  return env.ISOLATED_TEST_API==='true'
   && env.TWITCH_PROBE_ENABLED==='true'
   && parsed.pathname==='/'+expectedDb
   && env.TWITCH_PROBE_BROADCASTER_ID===expectedBroadcaster
   && typeof env.TWITCH_PROBE_SECRET==='string'&&env.TWITCH_PROBE_SECRET.length>=32
   && env.ENABLE_GIVEAWAYS!=='true'&&env.MULTISTREAM_DB_ENABLED!=='true'
   && env.ATOMIC_CHAT_RPC_ENABLED!=='true';
 }catch{return false;}
}
export async function startProbe(env=process.env){
 if(!probeConfig(env))throw new Error('Refusing non-isolated Twitch probe configuration');
 const pool=new Pool({connectionString:env.DATABASE_URL,max:1,connectionTimeoutMillis:5000});
 try{
  const result=await pool.query('select current_database() as name');
  if(result.rows[0]?.name!==expectedDb)throw new Error('Isolated database identity mismatch');
 }catch(e){await pool.end();throw e;}
 const server=http.createServer(async(req,res)=>{
  const send=status=>{res.writeHead(status,{'cache-control':'no-store'});res.end();};
  if(req.method==='GET'&&req.url==='/healthz'){
   try{const r=await pool.query('select current_database() as name');return send(r.rows[0]?.name===expectedDb?200:503);}
   catch{return send(503);}
  }
  if(req.method!=='POST'||req.url!=='/eventsub/twitch')return send(404);
  let body=Buffer.alloc(0);
  for await(const chunk of req){
   body=Buffer.concat([body,chunk]);
   if(body.length>65536)return send(413);
  }
  const id=String(req.headers['twitch-eventsub-message-id']||'');
  const timestamp=String(req.headers['twitch-eventsub-message-timestamp']||'');
  const signature=String(req.headers['twitch-eventsub-message-signature']||'');
  const type=String(req.headers['twitch-eventsub-message-type']||'');
  if(!verifyEventSubMessage({id,timestamp,signature,body,secret:env.TWITCH_PROBE_SECRET}))return send(403);
  let payload;try{payload=JSON.parse(body.toString('utf8'));}catch{return send(400);}
  if(type==='webhook_callback_verification'){
   if(payload?.subscription?.type!=='channel.chat.message'||payload?.subscription?.condition?.broadcaster_user_id!==expectedBroadcaster||typeof payload.challenge!=='string'||payload.challenge.length===0||payload.challenge.length>1024)return send(403);
   res.writeHead(200,{'content-type':'text/plain','cache-control':'no-store'});
   return res.end(String(payload.challenge||''));
  }
  if(type!=='notification'||!validChatNotification(payload))return send(400);
  if(payload.event.broadcaster_user_id!==expectedBroadcaster)return send(403);
  // Never persist chat or create/complete rounds. Acknowledge verified delivery only.
  return send(204);
 });
 server.listen(Number(env.PORT||10000),'0.0.0.0');
 server.on('close',()=>{void pool.end();});
 return server;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 await startProbe();
}
