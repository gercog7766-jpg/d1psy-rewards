import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createHmac} from 'node:crypto';
import {donationAlertEvent,donationCode,twitchBossEvent,installBossTwitchWebhook,installBossDonationAlertsOAuth,inspectBossTwitchSubscriptions,startBossDonationAlerts,bossDonationAlertsStatus} from '../src/live-boss-events.ts';
import cookieParser from 'cookie-parser';
import {installPartnerBossWebhook} from '../src/partner-boss-providers.ts';
test('Twitch connection requires both enabled subscription types for the exact owner and callback',async()=>{
 const callback='https://dropso.test/eventsub/boss',actor='11';let full=false;
 const request=async(url)=>{const q=new URL(url).searchParams,type=q.get('type'),after=q.get('after');const right={type,condition:{broadcaster_user_id:actor},transport:{method:'webhook',callback},status:'enabled'};const rows=type==='channel.subscribe'?(after?[right]:[{...right,transport:{method:'webhook',callback:'https://wrong.test'}}]):full?[right]:[{...right,status:'webhook_callback_verification_failed'}];return new Response(JSON.stringify({data:rows,pagination:type==='channel.subscribe'&&!after?{cursor:'next'}:{}}))};
 assert.equal((await inspectBossTwitchSubscriptions(actor,callback,{},request)).status,'partial');full=true;const status=await inspectBossTwitchSubscriptions(actor,callback,{},request);assert.equal(status.status,'connected');assert.equal(status.details,'2 из 2 событий подписок');
});
test('DonationAlerts only reports connected after a valid API response; unauthorized response changes status',async()=>{
 const original=globalThis.fetch,db={rpc(){return Promise.resolve({error:null})}};let stop;
 const until=async state=>{for(let i=0;i<50;i++){if(bossDonationAlertsStatus().status===state)return;await new Promise(r=>setTimeout(r,5))}assert.equal(bossDonationAlertsStatus().status,state)};
 try{globalThis.fetch=async()=>new Response(JSON.stringify({data:[]}));stop=startBossDonationAlerts(db,async()=>'mock-token');await until('connected');stop();
 globalThis.fetch=async()=>new Response('',{status:401});stop=startBossDonationAlerts(db,async()=>'mock-token');await until('reconnect_required');
 }finally{stop?.();globalThis.fetch=original}
});
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
test('partner subscription webhook verifies signature, approval and channel routing',async()=>{
 const app=express(),calls=[],secret='partner-test';
 const db={from(){let channel;return {select(){return this},eq(key,value){if(key==='broadcaster_id')channel=value;return this},maybeSingle(){return Promise.resolve({data:channel==='22'?{broadcaster_id:'22'}:null,error:null})}}},rpc(name,args){calls.push({name,args});return Promise.resolve({error:null})}};
 installPartnerBossWebhook(app,db,secret);const server=app.listen(0),url='http://127.0.0.1:'+server.address().port+'/eventsub/partner-boss';
 const send=async(channel,eventChannel,valid=true)=>{const raw=JSON.stringify({subscription:{type:'channel.subscribe',condition:{broadcaster_user_id:channel}},event:{broadcaster_user_id:eventChannel,user_id:'33',is_gift:false}}),at=new Date().toISOString(),id='partner-event',signature='sha256='+createHmac('sha256',valid?secret:'wrong').update(id+at+raw).digest('hex');return fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Twitch-Eventsub-Message-Id':id,'Twitch-Eventsub-Message-Timestamp':at,'Twitch-Eventsub-Message-Signature':signature,'Twitch-Eventsub-Message-Type':'notification'},body:raw})};
 try{assert.equal((await send('22','22',false)).status,403);assert.equal((await send('99','99')).status,403);assert.equal((await send('22','99')).status,204);assert.equal(calls.length,0);assert.equal((await send('22','22')).status,204);assert.equal(calls.length,1);assert.equal(calls[0].name,'rewards_partner_boss_provider_hit');assert.equal(calls[0].args.p_channel,'22');assert.equal(calls[0].args.p_actor,'33')}finally{await new Promise(r=>server.close(r))}
});
