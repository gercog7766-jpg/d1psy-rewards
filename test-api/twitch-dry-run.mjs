// Offline Twitch EventSub preflight: no network, OAuth, database, or writes.
import {verifyEventSubMessage} from '../src/eventsub-signature.mjs';
import {validChatNotification} from '../src/eventsub-payload.mjs';

export function inspectSyntheticEventSub({id,timestamp,body,signature,secret,secondaryId}){
 if(!verifyEventSubMessage({id,timestamp,body,signature,secret}))return {accepted:false,reason:'signature_invalid'};
 let payload;
 try{payload=JSON.parse(Buffer.from(body).toString('utf8'));}catch{return {accepted:false,reason:'json_invalid'};}
 if(!validChatNotification(payload))return {accepted:false,reason:'payload_invalid'};
 const broadcaster=String(payload.event.broadcaster_user_id);
 if(broadcaster!==String(secondaryId))return {accepted:false,reason:'secondary_only'};
 return {accepted:true,broadcaster,route:'isolated_secondary_dry_run',writes:false};
}
