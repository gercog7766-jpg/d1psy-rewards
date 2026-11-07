import test from 'node:test';
import assert from 'node:assert/strict';
import {validateIsolatedTwitchIdentity as validate} from '../test-api/twitch-oauth-identity.mjs';

const client='abcdefghijklmnopqrstuvwxyz123456';
const tokenInfo={client_id:client,user_id:'39780903',login:'amych',scopes:['user:read:chat','user:bot','channel:bot'],expires_in:3600};
const userInfo={id:'39780903',login:'amych'};
const check=(t=tokenInfo,u=userInfo,c=client)=>validate({tokenInfo:t,userInfo:u,expectedClientId:c});
test('isolated Twitch OAuth identity accepts only intended account, app and chat permission',()=>{
 assert.deepEqual(check(),{ok:true,broadcaster_id:'39780903',scopes:['user:read:chat','user:bot','channel:bot']});
 assert.equal(check({...tokenInfo,client_id:'differentapplication12345'}).reason,'wrong_twitch_application');
 assert.equal(check({...tokenInfo,user_id:'511100980'}).reason,'wrong_twitch_account');
 assert.equal(check({...tokenInfo,login:'d1psy_off'}).reason,'wrong_twitch_account');
 assert.equal(check(tokenInfo,{id:'511100980',login:'amych'}).reason,'wrong_twitch_account');
 assert.equal(check({...tokenInfo,scopes:[]}).reason,'missing_chat_permission');
 assert.equal(check({...tokenInfo,expires_in:0}).reason,'expired_or_invalid_token');
 assert.equal(check(tokenInfo,userInfo,'').reason,'missing_isolated_client_id');
 assert.equal(check(null).ok,false);
});
