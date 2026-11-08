import {withAccountLogoMenu} from './account-logo-menu.js';
import express from 'express';
import {withSiteBranding} from './site-branding.js';
import http from 'node:http';
import {withMobileLayout} from './mobile-layout.js';

export const siteScrollbarCss=String.raw`
html{scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:#9748d7 #0b0715}
*{scrollbar-width:thin;scrollbar-color:#9748d7 #0b0715}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-track{background:#0b0715;border-radius:10px}
::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#6c2ab5,#b265e9);border:2px solid #0b0715;border-radius:999px;min-height:38px}
::-webkit-scrollbar-thumb:hover{background:#bc78f0}
::-webkit-scrollbar-thumb:active{background:#cf9cf7}
::-webkit-scrollbar-corner{background:#0b0715}
::-webkit-scrollbar-button{display:none;width:0;height:0}
@media(forced-colors:active){html,*{scrollbar-color:auto}}
`;
export function withSiteScrollbars(body:string,path=''){
 if(['/obs','/streamer/obs'].includes(path)||!/^\s*(?:<!doctype html|<html\b)/i.test(body)||body.includes('id="siteScrollbarTheme"'))return body;
 const style='<style id="siteScrollbarTheme">'+siteScrollbarCss+'</style>';
 return /<\/head>/i.test(body)?body.replace(/<\/head>/i,style+'</head>'):body.replace(/<body\b/i,style+'<body');
}
/** Express HTML goes through send; legal/home pages also write directly to HTTP. */
export function installSiteScrollbars(){
 const response:any=(express as any).response,send=response.send;
 response.send=function(body:any){if(typeof body==='string')body=withAccountLogoMenu(withSiteScrollbars(withMobileLayout(withSiteBranding(body,this.req?.path||''),this.req?.path||''),this.req?.path||''),this.req?.path||'');return send.call(this,body)};
}
export function installRawPageScrollbars(){
 const emit=http.Server.prototype.emit;
 (http.Server.prototype as any).emit=function(this:any,event:string,...args:any[]){
  if(event==='request'){
   const req=args[0],res=args[1],end=res.end,path=String(req.url||'').split('?')[0];
   res.end=function(this:any,chunk:any,...rest:any[]){
    if(!res.headersSent&&String(res.getHeader('content-type')||'').includes('text/html')&&(typeof chunk==='string'||Buffer.isBuffer(chunk))){
     const original=typeof chunk==='string'?chunk:chunk.toString('utf8'),styled=withAccountLogoMenu(withSiteScrollbars(withMobileLayout(withSiteBranding(original,path),path),path),path);
     if(styled!==original){chunk=styled;if(res.hasHeader('content-length'))res.setHeader('content-length',Buffer.byteLength(styled));res.removeHeader('etag')}
    }
    return end.call(this,chunk,...rest);
   };
  }
  return Reflect.apply(emit,this,[event,...args]);
 };
}
