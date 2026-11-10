import {test} from 'node:test';import assert from 'node:assert/strict';import {validateAppUrl} from '../src/app-url-validation.ts';
test('APP_URL accepts only a complete HTTP(S) origin and rejects a pasted callback before startup',()=>{
 for(const value of [undefined,'https://dropso.site','https://www.dropso.site','https://d1psy-rewards.onrender.com','http://localhost:10000','http://127.0.0.1:12345'])assert.doesNotThrow(()=>validateAppUrl(value));
 for(const value of ['','https://dropso.sitehttps://dropso.site/auth/twitch/callbac','https://dropso.site/auth/twitch/callback','https://dropso.site/','https://dropso.site?foo=1','https://dropso.site#foo','https://name:password@dropso.site',' https://dropso.site','file:///tmp/test'])assert.throws(()=>validateAppUrl(value),/Invalid APP_URL/);
 try{validateAppUrl('https://name:private-password@dropso.site')}catch(e){assert(!e.message.includes('private-password'))}
});
