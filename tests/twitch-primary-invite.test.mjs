import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePrimaryInvite} from '../test-api/twitch-primary-oauth.mjs';
const env={
 ISOLATED_TEST_API:'true',TWITCH_PROBE_ENABLED:'true',TWITCH_OAUTH_ENABLED:'true',
 DATABASE_URL:'postgresql://postgres:placeholder@localhost/d1psy_multistream_test_db',
 TWITCH_PROBE_BROADCASTER_ID:'39780903',TWITCH_PROBE_SECRET:'x'.repeat(32),
 TWITCH_OAUTH_CLIENT_ID:'a'.repeat(30),TWITCH_OAUTH_CLIENT_SECRET:'z'.repeat(32),
 TEST_API_TOKEN:'t'.repeat(32)
};
function response(){return {status:null,headers:{},body:'',writeHead(status,headers){this.status=status;this.headers=headers;return this},end(body=''){this.body=body;return this}};}
test('primary invitation is authenticated, one-use, and GET preview does not consume it',()=>{
 const bad=response();
 assert.equal(handlePrimaryInvite({method:'POST',url:'/api/test/twitch/primary/invite',headers:{}},bad,env),true);
 assert.equal(bad.status,401);
 const issued=response();
 handlePrimaryInvite({method:'POST',url:'/api/test/twitch/primary/invite',headers:{authorization:'Bearer '+env.TEST_API_TOKEN}},issued,env);
 assert.equal(issued.status,200);
 const invite=new URL(JSON.parse(issued.body).invite_url);
 for(let i=0;i<2;i++){const preview=response();handlePrimaryInvite({method:'GET',url:invite.pathname,headers:{}},preview,env);assert.equal(preview.status,200);}
 const consumed=response();
 handlePrimaryInvite({method:'POST',url:invite.pathname,headers:{}},consumed,env);
 assert.equal(consumed.status,200);
 assert.match(consumed.body,/id\.twitch\.tv/);
 const replay=response();handlePrimaryInvite({method:'POST',url:invite.pathname,headers:{}},replay,env);assert.equal(replay.status,403);
});
