import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createHmac} from 'node:crypto';
import {donationAlertEvent,donationCode,twitchBossEvent,installBossTwitchWebhook,installBossDonationAlertsOAuth} from '../src/live-boss-events.ts';
import cookieParser from 'cookie-parser';
test('donation mapping and gift subscription de-duplication by event type',()=>{
 const code='12345678-abcd-1234-abcd-123456789abc';
 assert.equal(donationCode('[DROPSO:'+code+']'),code);
 assert.equal(donationCode('[DROPSO:'+code+'][DROPSO:'+code+']'),null);
 const row={id:5,name:'donation',username:'Alpha',message:'[DROPSO:'+code+']',currency:'RUB',amount:100,created_at:'2026-11-21 12:00:00'};
 assert.equal(donationAlertEvent(row).p_rub,100);assert.equal(donationAlertEvent(row).p_code,code);
 assert.equal(donationAlertEvent({...row,is_test:true}),null);
 assert.equal(donationAlertEvent({...row,is_manual:1}),null);
 assert.equal(donationAlertEvent({...row,currency:'USD'}),null);
 assert.equal(twitchBossEvent('channel.subscribe',{broadcaster_user_id:'11',user_id:'22',is_gift:true},'a',new Date().toISOString()),null);
 assert.equal(twitchBossEvent('channel.subscription.gift',{broadcaster_user_id:'11',user_id:'22',total:3,is_anonymous:false},'b',new Date().toISOString()).p_gifts,3);
});
test('DonationAlerts OAuth is owner-bound and persists encrypted tokens',async()=>{
 const app=express(),writes=[],original=globalThis.fetch;app.use(cookieParser());
 const db={from(){return {select(){return this},eq(){return this},maybeSingle(){return Promise.resolve({data:{twitch_broadcaster_id:'11'},error:null})},upsert(row){writes.push(row);return Promise.resolve({error:null})}}}};
 const admin=(q,r,n)=>{if(!q.get('x-user'))return r.sendStatus(401);r.locals.session={twitchUserId:q.get('x-user')};n()};
 installBossDonationAlertsOAuth(app,db,admin,{clientId:'1',clientSecret:'mock',encryptionKey:'mock-key',redirect:'https://dropso.test/auth/boss/donationalerts',poll:false});
 globalThis.fetch=async(url,opts)=>String(url).startsWith('https://www.donationalerts.com/oauth/token')?new Response(JSON.stringify({access_token:'mock-access-secret',refresh_token:'mock-refresh-secret',expires_in:3600}),{status:200}):original(url,opts);
 const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
 const get=(path,user,cookie)=>original(base+path,{redirect:'manual',headers:{'x-user':user,...(cookie?{cookie}:{})}});
 try{assert.equal((await get('/admin/bosses/donationalerts','22')).status,403);
 const r=await get('/admin/bosses/donationalerts','11');assert.equal(r.status,302);const u=new URL(r.headers.get('location')),state=u.searchParams.get('state'),cookie=r.headers.get('set-cookie').split(';')[0];assert.equal(u.searchParams.get('scope'),'oauth-donation-index');
 const callback='/auth/boss/donationalerts?code=mock&state='+state;assert.equal((await get(callback,'11',cookie)).status,302);assert.equal(writes.length,1);assert(!JSON.stringify(writes).includes('mock-access-secret'));assert(!JSON.stringify(writes).includes('mock-refresh-secret'));assert.equal((await get(callback,'11',cookie)).status,400);
 }finally{globalThis.fetch=original;await new Promise(resolve=>server.close(resolve))}
});
test('boss Twitch webhook authenticates primary channel and applies subscribed events',async()=>{
 const app=express(),calls=[],secret='mock-secret';
 const db={from(){return {select(){return this},eq(){return this},maybeSingle(){return Promise.resolve({data:{twitch_broadcaster_id:'11'},error:null})}}},rpc(name,args){calls.push({name,args});return Promise.resolve({error:null})}};
 installBossTwitchWebhook(app,db,secret);
 const server=app.listen(0),url='http://127.0.0.1:'+server.address().port+'/eventsub/boss';
 const send=async(body,kind='notification',valid=true)=>{const raw=JSON.stringify(body),at=new Date().toISOString(),id='test-event',signature='sha256='+createHmac('sha256',valid?secret:'wrong').update(id+at+raw).digest('hex');return fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Twitch-Eventsub-Message-Id':id,'Twitch-Eventsub-Message-Timestamp':at,'Twitch-Eventsub-Message-Signature':signature,'Twitch-Eventsub-Message-Type':kind},body:raw})};
 try{const p={subscription:{type:'channel.subscribe',condition:{broadcaster_user_id:'11'}},event:{broadcaster_user_id:'11',user_id:'22',is_gift:false}};
 assert.equal((await send(p,'notification',false)).status,403);assert.equal(calls.length,0);
 assert.equal((await send({...p,subscription:{...p.subscription,condition:{broadcaster_user_id:'99'}}})).status,403);
 assert.equal(await (await send({...p,challenge:'abc'},'webhook_callback_verification')).text(),'abc');
 assert.equal((await send(p)).status,204);assert.equal(calls.length,1);assert.equal(calls[0].args.p_actor,'22');
 }finally{await new Promise(resolve=>server.close(resolve))}
});
