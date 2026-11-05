import crypto from 'node:crypto';
export function verifyEventSubMessage({id,timestamp,signature,body,secret,now=Date.now()}) {
 if (!secret || !id || !timestamp || !signature || !Buffer.isBuffer(body)) return false;
 const parsed=Date.parse(timestamp);
 if (!Number.isFinite(parsed) || Math.abs(now-parsed)>600000) return false;
 const expected='sha256='+crypto.createHmac('sha256',secret).update(id+timestamp).update(body).digest('hex');
 const a=Buffer.from(expected),b=Buffer.from(signature);
 return a.length===b.length && crypto.timingSafeEqual(a,b);
}
