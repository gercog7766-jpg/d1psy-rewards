import express from 'express';

const CSS=`<style id="d1psyFooterStyles">.d1psy-footer{max-width:1040px;margin:18px auto 0;padding:24px;border-top:1px solid #51336f;color:#a99dbb}.footer-inner{display:flex;align-items:center;justify-content:space-between;gap:22px;flex-wrap:wrap}.footer-brand{display:flex;align-items:center;gap:10px;color:#eee}.age-mark{display:inline-flex;align-items:center;justify-content:center;min-width:38px;height:38px;padding:0 7px;border:1px solid #8b5cf6;border-radius:50%;color:#fff;font-weight:900}.footer-links{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.footer-links a{background:none!important;border:0!important;padding:0!important;color:#c4b5fd!important;text-decoration:none;cursor:pointer;font:inherit}.footer-links a:hover{text-decoration:underline}.footer-social{display:flex;gap:10px}.footer-social a{display:flex!important;width:40px;height:40px;padding:0!important;border-radius:10px!important;overflow:hidden;background:#20162e!important;align-items:center;justify-content:center}.footer-social img{width:100%;height:100%;object-fit:cover}.footer-copy{font-size:12px;margin-top:14px;color:#746b80}@media(max-width:700px){.d1psy-footer{padding:20px 16px}.footer-inner{align-items:flex-start;flex-direction:column}}</style>`;
const FOOTER=`<footer id="d1psyFooter" class="d1psy-footer"><div class="footer-inner"><div class="footer-brand"><strong>D1PSY Rewards</strong><span class="age-mark">18+</span></div><nav class="footer-links"><a href="/streamer">Стримерам</a><a href="/privacy">Политика конфиденциальности</a><a href="/rules">Правила</a><span>Только для пользователей 18+</span></nav><div class="footer-social"><a href="https://t.me/d1psy_off" target="_blank" rel="noopener noreferrer" aria-label="Telegram D1PSY"><img src="https://thumb.wikimedia.org/wikipedia/commons/thumb/8/83/Telegram_2019_Logo.svg/1280px-Telegram_2019_Logo.svg.png?utm_source=ru.wikipedia.org&utm_campaign=index&utm_content=thumbnail" alt="Telegram"></a><a href="https://www.twitch.tv/d1psy_off" target="_blank" rel="noopener noreferrer" aria-label="Twitch D1PSY"><img src="https://cdn-icons-png.flaticon.com/512/4138/4138153.png" alt="Twitch"></a></div></div><div class="footer-copy">© ${new Date().getFullYear()} D1PSY Rewards</div></footer>`;
export function installAccountFooterHotfix(){
  const proto:any=(express as any).application;
  const originalGet=proto.get;
  proto.get=function(path:any,...handlers:any[]){
    if(path==='/account'){
      handlers=handlers.map((handler:any)=>async function(req:any,res:any,next:any){
        const originalSend=res.send.bind(res);
        res.send=(body:any)=>{
          if(typeof body==='string'&&!body.includes('id="d1psyFooter"')){
            if(body.includes('</head>')) body=body.replace('</head>',CSS+'</head>');
            if(body.includes('</body>')) body=body.replace('</body>',FOOTER+'</body>');
          }
          return originalSend(body);
        };
        return handler(req,res,next);
      });
    }
    return originalGet.call(this,path,...handlers);
  };
}
