import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {handleOAuthStart,handleOAuthInvite,handleIsolatedOAuthCallback,oauthReady,readiness,currentTwitchSubscription} from '../test-api/twitch-oauth-callback.mjs';

function response(){
 const r=new EventEmitter();r.status=0;r.headers={};r.writeHead=(status,headers)=>{r.status=status;r.headers=headers;return r};r.end=(body)=>{r.body=body;return r};return r;
}
const isolated={ISOLATED_TEST_API:'true',DATABASE_URL:'postgresql://localhost/d1psy_multistream_test_db',TWITCH_OAUTH_ENABLED:'true',TWITCH_PROBE_ENABLED:'true',TWITCH_PROBE_BROADCASTER_ID:'39780903',TWITCH_PROBE_SECRET:'x'.repeat(40),TWITCH_OAUTH_CLIENT_ID:'a'.repeat(30),TWITCH_OAUTH_CLIENT_SECRET:'s'.repeat(40),TEST_API_TOKEN:'t'.repeat(40)};
test('OAuth is disabled by default and on production database',()=>{
 assert.equal(oauthReady({}),false);
 assert.equal(oauthReady({...isolated,DATABASE_URL:'postgresql://localhost/production'}),false);
 assert.equal(oauthReady({...isolated,ENABLE_GIVEAWAYS:'true'}),false);
 assert.equal(oauthReady({...isolated,SUPABASE_URL:'https://production.example'}),false);
 assert.equal(oauthReady(isolated),true);
});
test('authorize requires test API token and creates one-time cookie',()=>{
 const req={method:'POST',url:'/api/test/twitch/authorize',headers:{authorization:'Bearer '+'t'.repeat(40)}};
 const denied=response();handleOAuthStart({...req,headers:{}},denied,isolated);assert.equal(denied.status,401);
 const res=response();assert.equal(handleOAuthStart(req,res,isolated),true);assert.equal(res.status,200);
 const body=JSON.parse(res.body);const u=new URL(body.authorization_url);
 assert.equal(u.hostname,'id.twitch.tv');assert.equal(u.searchParams.get('scope'),'user:read:chat user:bot channel:bot');
 assert.match(res.headers['set-cookie'],/HttpOnly; SameSite=Lax/);
 assert.equal(readiness.subscription_created_by_app,false);
});
test('callback rejects absent state before any token exchange',async()=>{
 const res=response();assert.equal(await handleIsolatedOAuthCallback({method:'GET',url:'/oauth/twitch/callback?code=abcde&state=invalid',headers:{}},res,isolated),true);
 assert.equal(res.status,403);assert.equal(JSON.parse(res.body).error,'invalid_oauth_state');
});

test('valid amych OAuth callback creates only the isolated read-only subscription',async(t)=>{
 const originalFetch=globalThis.fetch;
 const calls=[];
 const client=isolated.TWITCH_OAUTH_CLIENT_ID;
 globalThis.fetch=async(url,options={})=>{
  const address=String(url);calls.push({address,options});
  if(address.endsWith('/oauth2/validate'))return {ok:true,json:async()=>({client_id:client,user_id:'39780903',login:'amych',scopes:['user:read:chat','user:bot','channel:bot'],expires_in:3600})};
  if(address.endsWith('/helix/users'))return {ok:true,json:async()=>({data:[{id:'39780903',login:'amych'}]})};
  if(address.endsWith('/helix/eventsub/subscriptions'))return {ok:true,json:async()=>({data:[{status:'webhook_callback_verification_pending'}]})};
  if(address.endsWith('/oauth2/token'))return {ok:true,json:async()=>({access_token:calls.filter(x=>x.address.endsWith('/oauth2/token')).length===1?'user-token':'app-token'})};
  throw new Error('Unexpected network request: '+address);
 };
 t.after(()=>{globalThis.fetch=originalFetch;});
 const start=response();
 handleOAuthStart({method:'POST',url:'/api/test/twitch/authorize',headers:{authorization:'Bearer '+isolated.TEST_API_TOKEN}},start,isolated);
 assert.equal(start.status,200);
 const state=new URL(JSON.parse(start.body).authorization_url).searchParams.get('state');
 const cookie=start.headers['set-cookie'].split(';')[0];
 const result=response();
 await handleIsolatedOAuthCallback({method:'GET',url:'/oauth/twitch/callback?state='+state+'&code=synthetic-code',headers:{cookie}},result,isolated);
 assert.equal(result.status,200);
 const body=JSON.parse(result.body);
 assert.equal(body.isolated,true);
 assert.equal(body.giveaway_processing,false);
 assert.equal(body.subscription_status,'webhook_callback_verification_pending');
 const subscription=calls.find(x=>x.address.endsWith('/helix/eventsub/subscriptions'));
 assert.ok(subscription);
 const payload=JSON.parse(subscription.options.body);
 assert.equal(payload.type,'channel.chat.message');
 assert.equal(payload.condition.broadcaster_user_id,'39780903');
 assert.equal(payload.transport.callback,'https://d1psy-multistream-isolated-api.onrender.com/eventsub/twitch');
 assert.equal(calls.length,5);
 const replay=response();
 await handleIsolatedOAuthCallback({method:'GET',url:'/oauth/twitch/callback?state='+state+'&code=synthetic-code',headers:{cookie}},replay,isolated);
 assert.equal(replay.status,403);
 assert.equal(calls.length,5);
});

test('one-time friend invite is admin-created, short-lived and cannot read dashboard data',async()=>{
 const unauth=response();
 assert.equal(handleOAuthInvite({method:'POST',url:'/api/test/twitch/invite',headers:{}},unauth,isolated),true);
 assert.equal(unauth.status,401);
 const created=response();
 handleOAuthInvite({method:'POST',url:'/api/test/twitch/invite',headers:{authorization:'Bearer '+isolated.TEST_API_TOKEN}},created,isolated);
 assert.equal(created.status,200);
 const body=JSON.parse(created.body);
 assert.equal(body.expires_in_seconds,900);
 const url=new URL(body.invite_url);
 assert.equal(url.origin,'https://d1psy-multistream-isolated-api.onrender.com');
 const request={method:'GET',url:url.pathname,headers:{}};
 const preview=response();handleOAuthInvite(request,preview,isolated);
 assert.equal(preview.status,200);
 assert.match(preview.body,/Продолжить через Twitch/);
 assert.match(preview.headers['content-security-policy'],/form-action 'self' https:\/\/id\.twitch\.tv/);
 const secondPreview=response();handleOAuthInvite(request,secondPreview,isolated);
 assert.equal(secondPreview.status,200);
 const first=response();handleOAuthInvite({...request,method:'POST'},first,isolated);
 assert.equal(first.status,200);
 assert.match(first.body,/Открыть Twitch/);
 assert.match(first.body,/https:\/\/id\.twitch\.tv\/oauth2\/authorize/);
 assert.match(first.headers['content-security-policy'],/default-src 'none'/);
 assert.match(first.headers['set-cookie'],/HttpOnly; SameSite=Lax/);
 const second=response();handleOAuthInvite({...request,method:'POST'},second,isolated);
 assert.equal(second.status,403);
 const invalid=response();handleOAuthInvite({method:'GET',url:'/oauth/twitch/invite/invalid',headers:{}},invalid,isolated);
 assert.equal(invalid.status,403);
 const blocked=response();handleOAuthInvite(request,blocked,{...isolated,DATABASE_URL:'postgresql://localhost/production'});
 assert.equal(blocked.status,503);
});

test('live Twitch status checks only isolated matching EventSub subscription',async(t)=>{
 const originalFetch=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async(url,options={})=>{
  calls.push(String(url));
  if(String(url).endsWith('/oauth2/token'))return {ok:true,json:async()=>({access_token:'app-token'})};
  if(String(url).includes('/helix/eventsub/subscriptions'))return {ok:true,json:async()=>({data:[
   {type:'channel.chat.message',status:'enabled',condition:{broadcaster_user_id:'other'},transport:{method:'webhook',callback:'https://d1psy-multistream-isolated-api.onrender.com/eventsub/twitch'}},
   {type:'channel.chat.message',status:'enabled',condition:{broadcaster_user_id:'39780903'},transport:{method:'webhook',callback:'https://d1psy-multistream-isolated-api.onrender.com/eventsub/twitch'}}
  ]})};
  throw Error('unexpected');
 };
 t.after(()=>{globalThis.fetch=originalFetch;});
 assert.deepEqual(await currentTwitchSubscription({...isolated,DATABASE_URL:'postgresql://localhost/production'}),{status:'not_configured',checked:false});
 const status=await currentTwitchSubscription(isolated);
 assert.equal(status.checked,true);assert.equal(status.status,'enabled');
 assert.equal(calls.length,2);
});
