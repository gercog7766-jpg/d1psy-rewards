// Test-process-only Twitch responses. Never imported by production entry points.
const original=globalThis.fetch;
globalThis.fetch=async(input,init)=>{const url=String(input);if(url==='https://id.twitch.tv/oauth2/token')return Response.json({access_token:'test-access'});if(url==='https://api.twitch.tv/helix/users')return Response.json({data:[{id:'referral-test-viewer',login:'viewer',display_name:'Viewer'}]});return original(input,init)};
