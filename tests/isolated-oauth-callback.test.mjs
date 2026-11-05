import test from 'node:test';
import assert from 'node:assert/strict';
import {handleIsolatedOAuthCallback} from '../test-api/twitch-oauth-callback.mjs';

test('OAuth callback is disabled, does not expose code, and does not redirect',async()=>{
 const secret='synthetic-authorization-code-should-never-appear';
 const headers={};let status;let body='';
 const res={writeHead(s,h){status=s;Object.assign(headers,h);return this;},end(x){body=String(x||'');return this;}};
 assert.equal(await handleIsolatedOAuthCallback({method:'GET',url:'/oauth/twitch/callback?code='+secret+'&state=synthetic'},res),true);
 assert.equal(status,503);
 assert.equal(headers['cache-control'],'no-store');
 assert.equal(headers['referrer-policy'],'no-referrer');
 assert.equal(headers.location,undefined);
 assert.equal(body.includes(secret),false);
 assert.equal(JSON.parse(body).error,'isolated_oauth_disabled');
 assert.equal(await handleIsolatedOAuthCallback({method:'GET',url:'/other'},res),false);
 assert.equal(await handleIsolatedOAuthCallback({method:'POST',url:'/oauth/twitch/callback'},res),false);
});
