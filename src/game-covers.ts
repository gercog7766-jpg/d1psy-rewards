import {resolve} from 'node:path';
export function installGameCoverRoutes(app:any){
 app.get('/games/covers/:file',(q:any,r:any)=>{
  if(!/^(night-run|minesweeper|defuse|wordly|tic-tac-toe)-v1-(480|960)\.webp$/.test(q.params.file))return r.sendStatus(404);
  r.type('webp').set('Cache-Control','public,max-age=31536000,immutable').sendFile(resolve('assets/games/covers',q.params.file));
 });
}
