import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {attachStreamerPartners} from '../src/users-partners.ts';
import {profileHtml,usersHtml,usersJs} from '../src/users-ui.ts';
import {nightShiftHtml} from '../src/night-shift-theme.ts';
test('partner identity uses approved broadcaster IDs and excludes pending, rejected and impersonated names',async()=>{
 const rows={rewards_users:[{twitch_login:'partner',twitch_user_id:'2'},{twitch_login:'pending',twitch_user_id:'3'},{twitch_login:'primary',twitch_user_id:'1'},{twitch_login:'imposter',twitch_user_id:'4'}],rewards_streamers:[{twitch_broadcaster_id:'1',is_primary:true}],rewards_streamer_live_profiles:[{broadcaster_id:'2',status:'approved'},{broadcaster_id:'3',status:'pending'},{broadcaster_id:'4',status:'rejected'}]};let fail=false;
 const db={from(table){let data=rows[table];const q={select(){return q},in(k,v){data=data.filter(r=>v.includes(r[k]));return q},eq(k,v){data=data.filter(r=>r[k]===v);return q},then(resolve){return Promise.resolve({data,error:fail?{}:null}).then(resolve)}};return q}};
 const users=rows.rewards_users.map(r=>({login:r.twitch_login}));await attachStreamerPartners(db,users);assert.deepEqual(users.map(u=>u.partner),[true,false,true,false]);fail=true;await assert.rejects(attachStreamerPartners(db,users));
});
test('partner profile and directory show badge, safe Twitch link and preserve private inventory',async()=>{
 for(const directory of [false,true]){
 const dom=new JSDOM(directory?usersHtml:profileHtml,{url:'https://test.local/users/partner',runScripts:'outside-only'}),w=dom.window;
 const u={login:'partner',name:'<img onerror=bad()>',partner:true,isPrivate:true,inventoryHidden:true,online:false};
 w.fetch=async()=>({ok:true,status:200,json:async()=>directory?{users:[u,{...u,partner:false,login:'viewer'}],page:1,pages:1,total:2,onlineCount:0,me:{login:'viewer',isPrivate:false}}:u});
 try{w.eval(usersJs);for(let i=0;i<100&&!w.document.querySelector('.streamer-badge');i++)await new Promise(r=>setTimeout(r,5));assert.equal(w.document.querySelectorAll('.streamer-badge').length,1);assert.equal(w.document.querySelector('.person-name img, #profileHead h1 img'),null);
 if(!directory){assert(w.document.querySelector('#profileHead.partner'));assert.equal(w.document.querySelector('.partner-twitch').href,'https://www.twitch.tv/partner');assert(w.document.querySelector('.private-empty'));assert.equal(w.document.querySelector('.skin'),null)}
 }finally{w.close()}
 }
});

test('partner profile groups its actions and shows its medal in Achievements without masking its equipped background',async()=>{
 const path='/users/partner';
 const dom=new JSDOM(nightShiftHtml(profileHtml,path),{url:'https://test.local'+path,runScripts:'outside-only'}),w=dom.window;
 try{
  const data={login:'partner',name:'Partner',partner:true,isSelf:true,items:[],total:0,
   majorMedal:{name:'Бронза',image:'/predict/major-medals/bronze.webp'},style:{background:'neon_red_bg',frame:'neon_red'}};
  w.fetch=async()=>({ok:true,status:200,json:async()=>data});
  w.eval(usersJs);
  await new Promise(resolve=>setImmediate(resolve));
  const doc=w.document,head=doc.getElementById('profileHead'),achievements=doc.getElementById('profileAchievements');
  assert.deepEqual([...head.querySelectorAll('.profile-actions>a')].map(link=>link.getAttribute('href')),
   ['https://www.twitch.tv/partner','/streamers','/profile/customize']);
  assert.equal(head.querySelector('.major-profile-medal'),null);
  assert.equal(achievements.hidden,false);
  assert.equal(achievements.querySelector('h2').textContent,'Достижения');
  assert.equal(achievements.querySelector('img').getAttribute('src'),data.majorMedal.image);
  assert.equal(head.dataset.background,'neon_red_bg');
  assert.equal(head.querySelector('.avatar').dataset.frame,'neon_red');
  assert.match(w.getComputedStyle(head).backgroundImage,/255,\s*53,\s*95|#ff355f/i);
  delete data.majorMedal;
  w.dispatchEvent(new w.Event('focus'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(achievements.hidden,true);
  assert.equal(achievements.querySelector('.major-profile-medal'),null);
 }finally{w.close()}
});
