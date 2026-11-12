import assert from 'node:assert/strict';
import {test} from 'node:test';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHmac,randomUUID} from 'node:crypto';
import {JSDOM} from 'jsdom';
import {predictAdminHtml,predictAdminJs} from '../src/predict-admin-ui.ts';
test('admin predictions: authorization, create retries, validation, cancellation and settlement',{timeout:30000},async()=>{
 let rows=[],rpc=null,inserts=0;
 const mock=http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');const u=new URL(req.url,'http://test');let body='';for await(const c of req)body+=c;const b=body?JSON.parse(body):null;
 if(u.pathname.endsWith('/rewards_admins'))return res.end(u.searchParams.get('twitch_user_id')==='eq.admin'?'{"twitch_user_id":"admin"}':'null');
 if(u.pathname.endsWith('/rewards_predict_matches')){const id=u.searchParams.get('id')?.slice(3);if(req.method==='POST'){rows.push({...b,status:'scheduled'});inserts++;res.statusCode=201;return res.end('')}if(req.method==='PATCH'){const m=rows.find(x=>x.id===id&&x.status===u.searchParams.get('status')?.slice(3)&&(!u.searchParams.has('tournament')||x.tournament!=='IEM Beijing'));if(m)Object.assign(m,b);return res.end(JSON.stringify(m?[{id}]:[]))}return res.end(JSON.stringify(id?rows.find(x=>x.id===id)||null:rows))}
 if(u.pathname.endsWith('/rpc/rewards_settle_predictions')){rpc=b;return res.end('{"ok":true,"claim_required":true}')}
 res.end('[]')});await new Promise(r=>mock.listen(0,'127.0.0.1',r));const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));const origin='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['--import','tsx','src/server-entry.ts'],{env:{...process.env,PORT:String(port),APP_URL:origin,SESSION_SECRET:'predict-admin-test',SUPABASE_URL:'http://127.0.0.1:'+mock.address().port,SUPABASE_SECRET_KEY:'test-key',TWITCH_CLIENT_ID:'',TWITCH_EVENTSUB_SECRET:''},stdio:'ignore'});
 const headers=id=>{const p=Buffer.from(JSON.stringify({twitchUserId:id,exp:Date.now()+60000})).toString('base64url');return {Cookie:'rewards_session='+p+'.'+createHmac('sha256','predict-admin-test').update(p).digest('base64url'),'Content-Type':'application/json',Origin:origin}};
 const post=(path,b,h=headers('admin'))=>fetch(origin+path,{method:'POST',headers:h,body:JSON.stringify(b)});
 try{for(let i=0;i<150;i++){try{await fetch(origin+'/predict-admin.js');break}catch{await new Promise(r=>setTimeout(r,50))}}
 assert.equal((await fetch(origin+'/admin/predict')).status,401);assert.equal((await fetch(origin+'/api/admin/predict',{headers:headers('user')})).status,403);assert.equal((await post('/api/admin/predict',{},headers('user'))).status,403);
 assert.equal((await fetch(origin+'/admin/predict',{headers:headers('admin')})).status,200);
 const m={id:'match-'+randomUUID(),tournament:'BLAST Rivals 2026 Season 2',startsAt:'2099-01-01T00:00:00Z',teamA:'The MongolZ',teamB:'Natus Vincere',logoA:'',logoB:'https://example.com/navi.png',rosterA:['nin9','bLitz','Techno','910','cobrazera'],rosterB:['Aleksib','iM','b1t','w0nderful','makazze']};
 assert.equal((await post('/api/admin/predict',m,{...headers('admin'),Origin:'https://evil.example'})).status,403);
 for(const bad of [{...m,tournament:'IEM Beijing'},{...m,rosterA:['a']},{...m,logoA:'javascript:alert(1)'},{...m,status:'settled'},{...m,startsAt:'invalid'},{...m,rosterA:[...m.rosterB]}])assert.equal((await post('/api/admin/predict',bad)).status,400);
 assert.equal((await post('/api/admin/predict',{...m,startsAt:new Date().toISOString()})).status,409);
 assert.equal((await post('/api/admin/predict',m)).status,200);assert.equal((await post('/api/admin/predict',m)).status,200);assert.equal(inserts,1);assert.equal((await post('/api/admin/predict',{...m,teamA:'changed'})).status,409);
 assert.equal((await(await fetch(origin+'/api/admin/predict',{headers:headers('admin')})).json()).matches.length,1);
 const visibility='/api/admin/predict/'+m.id+'/visibility';
 assert.equal((await post(visibility,{hidden:true},headers('user'))).status,403);
 assert.equal((await post(visibility,{hidden:true},{...headers('admin'),Origin:'https://evil.example'})).status,403);
 assert.equal((await post(visibility,{hidden:'true'})).status,400);
 assert.equal((await post(visibility,{hidden:true})).status,409);
 const result={winner:'a',score:'2:0',topPlayers:['bLitz']};assert.equal((await post('/api/admin/predict/'+m.id+'/settle',result,{...headers('admin'),Origin:'https://evil.example'})).status,403);assert.equal(rpc,null);
 assert.equal((await post('/api/admin/predict/'+m.id+'/settle',result)).status,200);assert.equal(rpc.p_winner,'a');assert.deepEqual(rpc.p_top_players,['bLitz']);
 assert.equal((await post('/api/admin/predict/'+m.id+'/cancel',{})).status,200);assert.equal((await post('/api/admin/predict/'+m.id+'/cancel',{})).status,200);rows[0].status='settled';assert.equal((await post('/api/admin/predict/'+m.id+'/cancel',{})).status,409);
 assert.equal((await post(visibility,{hidden:true})).status,200);assert(Number.isFinite(Date.parse(rows[0].hidden_at)));
 assert.equal((await post(visibility,{hidden:false})).status,200);assert.equal(rows[0].hidden_at,null);
 rows[0].tournament='IEM Beijing';assert.equal((await post(visibility,{hidden:false})).status,409);
 }finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));await new Promise(r=>mock.close(r))}
});
test('admin UI safely renders team names and sends explicit confirmed result',async()=>{const dom=new JSDOM(predictAdminHtml,{url:'https://example.com/admin/predict',runScripts:'outside-only'}),w=dom.window;const calls=[];w.confirm=()=>true;w.fetch=async(path,options)=>{if(options?.method==='POST'){calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true})}}return {ok:true,json:async()=>({matches:[{id:'m',team_a:'<img src=x onerror=bad>',team_b:'NAVI',tournament:'IEM Beijing',starts_at:'2020-01-01T00:00:00Z',status:'scheduled',roster_a:['bLitz','a','b','c','d'],roster_b:['e','f','g','h','i']}]})}};try{w.eval(predictAdminJs);await new Promise(r=>setTimeout(r,20));assert.equal(w.document.querySelector('#matches img'),null);const f=w.document.querySelector('.settle');f.querySelector('[name=top] option').selected=true;f.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await new Promise(r=>setTimeout(r,20));assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),{winner:'a',score:'2:0',topPlayers:['bLitz']})}finally{w.close()}});

test('admin create form splits multiline rosters and converts local date to UTC',async()=>{const dom=new JSDOM(predictAdminHtml,{url:'https://example.com/admin/predict',runScripts:'outside-only'}),w=dom.window,calls=[];w.crypto.randomUUID=randomUUID;w.fetch=async(path,options)=>{if(options?.method==='POST'){calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true})}}return {ok:true,json:async()=>({matches:[]})}};try{w.eval(predictAdminJs);await new Promise(r=>setTimeout(r,20));const f=w.document.getElementById('create');for(const [name,value] of Object.entries({teamA:'A',teamB:'B',starts:'2099-01-01T12:00',rosterA:['a','b','c','d','e'].join(String.fromCharCode(10)),rosterB:['f','g','h','i','j'].join(String.fromCharCode(10))}))f.elements.namedItem(name).value=value;f.dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,20));assert.equal(calls[0].rosterA.length,5);assert.equal(calls[0].rosterB.length,5);assert.equal(calls[0].startsAt,new w.Date('2099-01-01T12:00').toISOString())}finally{w.close()}});
