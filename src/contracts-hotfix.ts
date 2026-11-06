import express from 'express';
import {contractsHtml, contractsJs} from './contracts-ui.js';

/** Presentation-only sandbox. No inventory, wallet or reward endpoints. */
export function installContractsDemo() {
  const proto:any=(express as any).application, get=proto.get, listen=proto.listen;
  let auth:any;
  proto.get=function(route:any,...handlers:any[]){
    if(route==='/api/me'&&handlers.length>1)auth=handlers[0];
    return get.call(this,route,...handlers);
  };
  const response:any=(express as any).response, send=response.send;
  response.send=function(body:any){
    if(typeof body==='string'&&body.includes('</html>')&&!body.includes('id="contractsLink"')){
      body=body.replace(/(<a\b[^>]*href="\/upgrader"[^>]*>[\s\S]*?<\/a>)/,'$1<a id="contractsLink" class="shoplink back" href="/contracts">Контракты</a>');
    }
    return send.call(this,body);
  };
  proto.listen=function(...args:any[]){
    if(!this.locals.__contractsDemo&&auth){
      this.locals.__contractsDemo=true;
      this.get('/contracts',auth,(_req:any,res:any)=>res.set('Cache-Control','no-store').send(contractsHtml));
      this.get('/contracts.js',(_req:any,res:any)=>res.type('application/javascript').set('Cache-Control','no-store').send(contractsJs));
    }
    return listen.apply(this,args);
  };
}
