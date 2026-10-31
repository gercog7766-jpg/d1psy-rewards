import express from 'express';

function page(){return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Рефералы — D1PSY REWARDS</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#10091a;color:#f7f2ff;font-family:system-ui,-apple-system,Segoe UI,sans-serif}main{min-height:100vh;display:grid;place-items:center;padding:24px}.soon{text-align:center}.brand{display:block;color:#a78bfa;text-decoration:none;font-size:12px;font-weight:900;letter-spacing:.16em;margin-bottom:22px}.soon h1{margin:0;font-size:clamp(54px,14vw,110px);letter-spacing:.08em;line-height:1;font-weight:950}.soon p{margin:18px 0 0;color:#8f829a;font-size:14px}.back{display:inline-block;margin-top:28px;padding:10px 15px;border:1px solid #4b2869;border-radius:10px;background:#21112f;color:#fff;text-decoration:none;font-weight:800}</style></head><body><main><div class="soon"><a class="brand" href="/account">D1PSY REWARDS</a><h1>СКОРО</h1><p>Реферальная программа временно недоступна.</p><a class="back" href="/account">Вернуться в кабинет</a></div></main></body></html>`}

export function installReferralHotfix(){
 const proto:any=(express as any).application, originalListen=proto.listen;
 proto.listen=function(...args:any[]){const app:any=this;if(!app.locals.__referralSoon){app.locals.__referralSoon=true;app.get('/referrals',(_req:any,res:any)=>{res.set('Cache-Control','no-store');res.send(page())})}return originalListen.apply(this,args)};
}
