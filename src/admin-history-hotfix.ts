import express from 'express';

export function installAdminHistoryHotfix(){
  const proto:any=(express as any).application;
  const originalGet=proto.get;
  proto.get=function(path:any,...handlers:any[]){
    if(path!=='/admin') return originalGet.call(this,path,...handlers);
    return originalGet.call(this,path,...handlers.map((handler:any)=>async function(req:any,res:any,next:any){
      const originalSend=res.send.bind(res);
      res.send=(body:any)=>{
        if(typeof body==='string'){
          body=body.replace('list.slice(0,20).map(', 'list.slice(0,100).map(');
          body=body.replace('.wins{display:grid;gap:9px}', '.wins{display:grid;gap:9px;max-height:70vh;overflow-y:auto;padding-right:6px}');
        }
        return originalSend(body);
      };
      return handler(req,res,next);
    }));
  };
}
