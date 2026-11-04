import test from 'node:test';
import assert from 'node:assert/strict';
import {pocOauthAllowed,matchesPocAccount} from '../src/poc-oauth-guard.mjs';
const safe={routesEnabled:true,isolation:true,multistreamDbEnabled:false,expectedLogin:'amych'};
test('PoC OAuth is allowed only with isolated routes and DB routing disabled',()=>{
 assert.equal(pocOauthAllowed(safe),true);
 for(const change of [{isolation:false},{routesEnabled:false},{multistreamDbEnabled:true},{expectedLogin:''}]){
   assert.equal(pocOauthAllowed({...safe,...change}),false);
 }
});
test('PoC authorization verifies login and optional numeric broadcaster ID',()=>{
 assert.equal(matchesPocAccount({id:'39780903',login:'Amych'},{expectedLogin:'amych',expectedBroadcasterId:'39780903'}),true);
 assert.equal(matchesPocAccount({id:'39780904',login:'amych'},{expectedLogin:'amych',expectedBroadcasterId:'39780903'}),false);
 assert.equal(matchesPocAccount({id:'39780903',login:'other'},{expectedLogin:'amych'}),false);
 assert.equal(matchesPocAccount({id:'bad',login:'amych'},{expectedLogin:'amych'}),false);
});
