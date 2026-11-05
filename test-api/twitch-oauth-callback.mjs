// Reserved OAuth callback for a future isolated Twitch authorization flow.
// Fail closed: never exchange codes, persist tokens, or redirect to production.
export const callbackPath='/oauth/twitch/callback';
export function handleIsolatedOAuthCallback(req,res){
 if(req.method!=='GET')return false;
 const pathname=new URL(req.url||'/', 'http://localhost').pathname;
 if(pathname!==callbackPath)return false;
 res.writeHead(503,{
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'referrer-policy':'no-referrer',
  'x-content-type-options':'nosniff'
 });
 res.end(JSON.stringify({
  error:'isolated_oauth_not_configured',
  message:'Twitch OAuth is not enabled on this isolated test service. No authorization code was used.'
 }));
 return true;
}
