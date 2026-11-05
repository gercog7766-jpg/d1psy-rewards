import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePrimaryTwitchIdentity} from '../test-api/twitch-primary-identity.mjs';
const client='a'.repeat(30);
const token={client_id:client,user_id:'123456789',login:'d1psy_off',scopes:['user:read:chat','user:bot','channel:bot'],expires_in:3600};
const user={id:'123456789',login:'d1psy_off'};
const validate=(t=token,u=user)=>validatePrimaryTwitchIdentity({tokenInfo:t,userInfo:u,expectedClientId:client});
test('primary Twitch account accepted only after matching OAuth token and Helix user',()=>{
 assert.equal(validate().ok,true);
 assert.equal(validate().broadcaster_id,'123456789');
 for(const [t,u] of [
  [{...token,client_id:'b'.repeat(30)},user],
  [{...token,login:'amych'},user],
  [{...token,user_id:'39780903'}, {...user,id:'39780903'}],
  [token,{...user,login:'amych'}],
  [token,{...user,id:'other'}],
  [{...token,scopes:['user:read:chat']},user],
  [{...token,expires_in:0},user],
 ])assert.equal(validate(t,u).ok,false);
});
