import express from 'express';
// Temporary switch: implementation and persistent history remain intact.
export const pausedFeatures=['live','contracts'] as const;
export function isPausedPath(path:string){return /^\/(?:live(?:\.js|\/|$)|contracts(?:\.js|\/|$)|admin\/live(?:\/|$)|api\/(?:me|admin)\/(?:live|contracts)(?:\/|$))/.test(path)}
export function withoutPausedLinks(html:string){return html.replace(/<a\b[^>]*\bhref=["']\/(?:live|contracts|admin\/live)(?:[?#][^"']*)?["'][^>]*>[\s\S]*?<\/a>/gi,'')}
export function installPausedFeatures(){const app:any=(express as any).application,response:any=(express as any).response,handle=app.handle,send=response.send;app.handle=function(req:any,res:any,done:any){const path=new URL(req.url,'http://local').pathname.toLowerCase();if(isPausedPath(path)){res.statusCode=404;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify({error:'feature_unavailable'}))}return handle.call(this,req,res,done)};response.send=function(body:any){if(typeof body==='string'&&body.includes('</html>'))body=withoutPausedLinks(body);return send.call(this,body)};}
