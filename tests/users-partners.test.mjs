import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {attachStreamerPartners} from '../src/users-partners.ts';
import {profileHtml,usersHtml,usersJs} from '../src/users-ui.ts';
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
