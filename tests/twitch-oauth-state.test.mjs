import test from 'node:test';
import assert from 'node:assert/strict';
import {createOAuthState,validateOAuthState,oauthStateCookie,clearOAuthStateCookie,STATE_TTL_MS} from '../test-api/twitch-oauth-state.mjs';

test('OAuth state is random, short-lived and constant-time checked',()=>{
 const now=1_800_000_000_000;
 const a=createOAuthState(now),b=createOAuthState(now);
 assert.notEqual(a.value,b.value);
 assert.equal(a.value.length,43);
 assert.equal(validateOAuthState({expected:a.value,received:a.value,createdAt:now,now:now+1000}),true);
 assert.equal(validateOAuthState({expected:a.value,received:b.value,createdAt:now,now:now+1000}),false);
 assert.equal(validateOAuthState({expected:a.value,received:a.value,createdAt:now,now:now+STATE_TTL_MS+1}),false);
 assert.equal(validateOAuthState({expected:a.value,received:a.value,createdAt:now+1,now}),false);
 assert.equal(validateOAuthState({expected:a.value,received:'invalid',createdAt:now,now}),false);
 assert.equal(validateOAuthState({expected:a.value,received:a.value,createdAt:NaN,now}),false);
 const cookie=oauthStateCookie(a.value);
 assert.match(cookie,/Secure; HttpOnly; SameSite=Lax; Max-Age=300/);
 assert.match(cookie,/^__Host-isolated-oauth-state=/);
 assert.match(clearOAuthStateCookie(),/Max-Age=0/);
 assert.throws(()=>oauthStateCookie('bad'));
});
