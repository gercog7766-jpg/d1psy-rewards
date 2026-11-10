/** APP_URL is an origin, never an OAuth callback or a page URL. Keep origin checks strict. */
export function validateAppUrl(value:string|undefined){
 if(value===undefined)return;
 try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||value!==url.origin)throw Error('invalid');}
 catch{throw Error('Invalid APP_URL: use only the site origin, for example https://dropso.site. Set the Twitch callback separately in TWITCH_REDIRECT_URI.');}
}
