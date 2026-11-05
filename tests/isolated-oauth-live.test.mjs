import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {handleOAuthStart,handleIsolatedOAuthCallback,oauthReady,readiness} from '../test-api/twitch-oauth-callback.mjs';

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
 assert.equal(u.hostname,'id.twitch.tv');assert.equal(u.searchParams.get('scope'),'user:read:chat');
 assert.match(res.headers['set-cookie'],/HttpOnly; SameSite=Lax/);
 assert.equal(readiness.subscription_created_by_app,false);
});
test('callback rejects absent state before any token exchange',async()=>{
 const res=response();assert.equal(await handleIsolatedOAuthCallback({method:'GET',url:'/oauth/twitch/callback?code=abcde&state=invalid',headers:{}},res,isolated),true);
 assert.equal(res.status,403);assert.equal(JSON.parse(res.body).error,'invalid_oauth_state');
});
