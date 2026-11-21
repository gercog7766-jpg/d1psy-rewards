import type {Express,RequestHandler} from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';

export const liveBoostMarkup=String.raw`
<style>
#liveBoostBanner[hidden]{display:none!important}
#liveBoostBanner{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:17px 22px;margin:0 0 14px;border:1px solid #c55cf5;border-radius:14px;background:radial-gradient(ellipse at 85% 10%,#8b2bd344,transparent 65%),linear-gradient(120deg,#2c153e,#180e27);box-shadow:0 0 20px #9628bc31;color:#fff}
#liveBoostBanner strong{font-size:clamp(20px,3.5vw,30px);font-weight:950;font-style:italic;letter-spacing:-.02em}
#liveBoostBanner strong span{color:#da83ff}
#liveBoostBanner p{margin:5px 0 0;color:#e2c7ef;font-size:13px}
#liveBoostBanner a{flex:none;text-decoration:none;color:white;background:linear-gradient(145deg,#873ed2,#59218a);border:1px solid #c47bf2;border-radius:10px;padding:10px 15px;font-weight:800;font-size:13px}
#liveBoostBanner .live-boost-dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#ff5071;box-shadow:0 0 12px #ff5071;margin-right:8px}
#liveBoostBanner[data-eligible="true"] .live-boost-dot{background:#52db9b;box-shadow:0 0 12px #52db9b}
@media(max-width:600px){#liveBoostBanner{padding:13px 15px;gap:10px;flex-wrap:wrap}#liveBoostBanner a{width:100%;text-align:center}}
</style><section id="liveBoostBanner" hidden aria-label="LIVE BOOST"><div><strong><i class="live-boost-dot" aria-hidden="true"></i>LIVE BOOST <span>+25% XP</span></strong><p id="liveBoostStatus"></p></div><a id="liveBoostWatch" target="_blank" rel="noopener noreferrer">Смотреть стрим →</a></section>
<script src="/live-boost.js" defer></script>`;
export const liveBoostScript=String.raw`(()=>{
 const banner=document.getElementById('liveBoostBanner'),status=document.getElementById('liveBoostStatus'),watch=document.getElementById('liveBoostWatch');
 if(!banner||!status||!watch)return;
 const anchor=document.getElementById('adventAccountHero')||document.getElementById('majorPickemBanner')||document.getElementById('vaultAccountHero');
 if(anchor)anchor.before(banner);
 let pending=false;
 async function refresh(){if(pending)return;pending=true;try{
 const r=await fetch('/api/me/live-boost',{cache:'no-store'});if(!r.ok)throw Error();
 const d=await r.json();if(!d.live||!(/^[a-z0-9_]{1,25}$/i.test(d.login||''))){banner.hidden=true;return}
 watch.href='https://www.twitch.tv/'+d.login;banner.dataset.eligible=String(!!d.eligible);
 status.textContent=d.eligible?'Буст активен · +25% опыта Dropso за обычные активности на сайте.':'Стример в эфире! Присоединяйся к чату трансляции, чтобы получить +25% опыта Dropso.';
 banner.hidden=false;
 }catch{banner.hidden=true}finally{pending=false}}
 void refresh();setInterval(()=>{if(!document.hidden)void refresh()},30000);
})();`;
export function installLiveBoost(app:Express,db:SupabaseClient,user:RequestHandler){
 app.get('/live-boost.js',(_q,r)=>r.set('Cache-Control','no-store').type('application/javascript').send(liveBoostScript));
 app.get('/api/me/live-boost',user,async(_q,r)=>{
  r.set('Cache-Control','private,no-store');
  const {data,error}=await db.rpc('rewards_live_boost_status',{p_actor:r.locals.session.twitchUserId});
  if(error){r.status(503).json({live:false});return}
  r.json(data||{live:false});
 });
 app.use((q,r,n)=>{if(q.path==='/account'){const send=r.send.bind(r);r.send=function(body){if(typeof body==='string'&&!body.includes('id="liveBoostBanner"'))body=body.replace('</body>',liveBoostMarkup+'</body>');return send(body)}}n()});
}
