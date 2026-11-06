import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import {randomUUID,createHmac} from 'node:crypto';import {spawn} from 'node:child_process';import {JSDOM,VirtualConsole} from 'jsdom';import http from 'node:http';

test('full Defuse app: auth, preview, mistakes, modules, 30-coin win, persistence and shared cooldown',{timeout:30000},async()=>{
 const db=new PGlite(),user=randomUUID();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table rewards_users(id uuid primary key,banned boolean default false);create table rewards_coin_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,amount integer,transaction_type text,note text);');await db.query('insert into rewards_users(id) values($1)',[user]);await db.exec(await readFile(new URL('../supabase/migrations/20261106035441_defuse_game.sql',import.meta.url),'utf8'));
 const mock=http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');const path=new URL(req.url,'http://test').pathname;
  if(path.endsWith('/rewards_users'))return res.end(JSON.stringify({id:user,twitch_login:'viewer',banned:false}));
  if(path.includes('/rpc/rewards_defuse_')){let raw='';for await(const c of req)raw+=c;const p=JSON.parse(raw);assert.equal(p.p_user,user);
   const name=path.split('/').at(-1);const keys=name.endsWith('_state')?['p_user']:name.endsWith('_start')?['p_user','p_id','p_difficulty','p_puzzles']:['p_user','p_game','p_stage','p_answer','p_request'];const values=keys.map(k=>k==='p_puzzles'?JSON.stringify(p[k]):p[k]);
   try{const out=await db.query('select '+name+'('+keys.map((k,i)=>'$'+(i+1)+(k==='p_puzzles'?'::jsonb':'')).join(',')+') value',values);res.end(JSON.stringify(out.rows[0].value))}catch(e){res.statusCode=409;res.end(JSON.stringify({message:e.message,code:'P0001'}))}return;
  }res.end('[]');
 });await new Promise(r=>mock.listen(0,'127.0.0.1',r));
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const server=spawn(process.execPath,['--import','tsx','src/server-entry.ts'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),SESSION_SECRET:'defuse-ui',SUPABASE_URL:'http://127.0.0.1:'+mock.address().port,SUPABASE_SECRET_KEY:'test',REWARDS_ENGINE_ENABLED:'false',TWITCH_CLIENT_ID:'',TWITCH_EVENTSUB_SECRET:''},stdio:'ignore'});
 const base='http://127.0.0.1:'+port,payload=Buffer.from(JSON.stringify({twitchUserId:'viewer',login:'viewer',displayName:'Viewer',exp:Date.now()+120000})).toString('base64url'),cookie='rewards_session='+payload+'.'+createHmac('sha256','defuse-ui').update(payload).digest('base64url');let dom;
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),until=async f=>{for(let i=0;i<150;i++){if(f())return;await pause(15)}assert(f(),'UI condition timeout')};
 try{
  for(let i=0;i<100;i++){try{await fetch(base+'/games/defuse.js');break}catch{await pause(40)}}
  assert.equal((await fetch(base+'/api/me/defuse')).status,401);assert((await(await fetch(base+'/games',{headers:{Cookie:cookie}})).text()).includes('href="/games/defuse"'));
  assert.equal((await fetch(base+'/api/me/defuse/start',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json',Origin:'https://evil.test'},body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/me/defuse/start',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({difficulty:'__proto__',requestId:randomUUID()})})).status,400);
  const html=await(await fetch(base+'/games/defuse',{headers:{Cookie:cookie}})).text(),js=await(await fetch(base+'/games/defuse.js')).text();assert(html.includes('/manifest.webmanifest'));const errors=[];
  async function mount(){dom?.window.close();const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));dom=new JSDOM(html,{url:base+'/games/defuse',runScripts:'outside-only',virtualConsole:vc});const w=dom.window;w.fetch=(path,opts)=>fetch(base+path,{...opts,headers:{...opts?.headers,Cookie:cookie}});w.crypto.randomUUID=randomUUID;w.eval(js);await until(()=>!w.document.getElementById('message').textContent.includes('Загрузка игры'));return w}
  let w=await mount();const q=s=>w.document.querySelector(s);q('[data-level="expert"]').click();q('#start').click();await until(()=>q('.preview'));
  assert.equal(q('#start').disabled,true);assert.equal(q('[data-level="rookie"]').disabled,true);assert.equal((await db.query('select count(*) n from rewards_defuse_games')).rows[0].n,1);
  const game=(await db.query('select * from rewards_defuse_games')).rows[0];
  async function ready(){await db.query("update rewards_defuse_games set ready_at=clock_timestamp()-interval '1 second' where id=$1",[game.id]);w.dispatchEvent(new w.Event('focus'));await pause(80)}
  await ready();await until(()=>q('.keypad'));const type=text=>{for(const key of text)w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true}))};
  type(game.puzzles[0].answer==='000000'?'111111':'000000');q('#submit').click();await until(()=>q('#strikes').textContent.includes('1 / 3')&&q('#submit').disabled);await until(()=>q('.keypad button')?.disabled===false);assert(q('#message').textContent.includes('−5'));
  type(game.puzzles[0].answer);q('#submit').click();await until(()=>q('.symbol-keys'));assert.equal(q('#stageLabel').textContent,'Модуль 2 из 3');
  for(const id of game.puzzles[1].answer)q('[data-symbol="'+id+'"]').click();q('#submit').click();await until(()=>q('.signals'));await ready();await until(()=>q('[data-signal="0"]')?.disabled===false);
  for(const id of game.puzzles[2].answer)q('[data-signal="'+id+'"]').click();q('#submit').click();await until(()=>q('.result-title'));assert.equal(q('.result-title').textContent,'BOMB DEFUSED');assert.equal(q('.reward').textContent,'+30 монет');assert.equal((await db.query('select sum(amount) n from rewards_coin_transactions')).rows[0].n,30);assert(q('#cooldown').textContent.includes('Следующая попытка'));
  w=await mount();await until(()=>q('.result-title'));assert.equal(q('#start').disabled,true);assert.equal(q('.reward').textContent,'+30 монет');
  const cooldown=await(await fetch(base+'/api/me/defuse/start',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({difficulty:'rookie',requestId:randomUUID(),p_user:randomUUID(),reward:99999})})).json();assert.equal(cooldown.game.id,game.id);assert.equal(cooldown.canStart,false);assert.equal((await db.query('select count(*) n from rewards_defuse_games')).rows[0].n,1);
  assert.deepEqual(errors,[]);
 }finally{dom?.window.close();server.kill('SIGTERM');await new Promise(r=>mock.close(r));await db.close()}
});
