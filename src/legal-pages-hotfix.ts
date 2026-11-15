import {dropsoRules} from './dropso-rules.js';
import http from 'node:http';
import crypto from 'node:crypto';

const TERMS_VERSION='2026-11-02';
const PRIVACY=`<h1>Политика конфиденциальности D1PSY Rewards</h1><p class="muted">Дата вступления в силу: 02.11.2026</p><h2>1. Общие положения</h2><p>Настоящая Политика описывает обработку данных при использовании D1PSY Rewards. Используя сервис, пользователь подтверждает ознакомление с настоящей Политикой.</p><h2>2. Какие данные обрабатываются</h2><p>Сервис может обрабатывать идентификатор, логин и отображаемое имя Twitch, данные авторизации и технической сессии, Steam Trade URL, историю действий внутри D1PSY Rewards, сведения о наградах, балансе, XP, SP, заданиях, Battle Pass, операциях магазина и апгрейдера, а также технические журналы, необходимые для безопасности и диагностики.</p><h2>3. Цели обработки</h2><p>Данные используются для авторизации, работы аккаунта и игровых механик, выдачи наград, предотвращения мошенничества и абьюза, технической поддержки, обеспечения безопасности и исправления ошибок.</p><h2>4. Сторонние сервисы</h2><p>D1PSY Rewards взаимодействует с Twitch и Steam. Обработка данных этими платформами регулируется их собственными условиями и политиками. Сервис не запрашивает пароль пользователя от Twitch или Steam.</p><h2>5. Передача и раскрытие</h2><p>Данные не предназначены для продажи третьим лицам. Они могут передаваться поставщикам инфраструктуры в объёме, необходимом для работы сервиса, либо раскрываться в случаях, предусмотренных применимым законодательством.</p><h2>6. Хранение и безопасность</h2><p>Данные хранятся в течение срока, необходимого для работы сервиса, разрешения спорных ситуаций, предотвращения злоупотреблений и выполнения применимых требований. Принимаются разумные технические и организационные меры защиты.</p><h2>7. Права пользователя</h2><p>Пользователь может обратиться к администрации по вопросам своих данных через официальные каналы D1PSY. Права, предоставленные применимым законодательством, сохраняются в полном объёме.</p><h2>8. Изменения Политики</h2><p>Политика может обновляться. Актуальная версия публикуется на этой странице.</p>`;
const CSS=`*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#09070e;color:#f8f7ff;font-family:Inter,system-ui,sans-serif}body{background:radial-gradient(circle at 72% 28%,rgba(109,40,217,.2),transparent 28%),#09070e}.nav,.legal{width:min(900px,calc(100% - 40px));margin:auto}.nav{padding:28px 0;display:flex;justify-content:space-between;gap:20px}.brand{font-weight:900;letter-spacing:.12em}.brand span,a{color:#a78bfa}.legal{padding:25px 0 70px}.legal h1{font-size:38px}.legal h2{font-size:19px;margin-top:30px}.legal p,.legal li{color:#b8aec5;line-height:1.7}.legal li{margin-bottom:10px}.muted{color:#ac9abb!important}`;
function page(title:string,body:string){return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · D1PSY Rewards</title><style>${CSS}</style></head><body><nav class="nav"><div class="brand">D1PSY <span>REWARDS</span></div><a href="/">← На главную</a></nav><main class="legal">${body}</main></body></html>`}
function consentToken(){const secret=process.env.SESSION_SECRET||'d1psy';const payload=Buffer.from(JSON.stringify({v:TERMS_VERSION,adult:true,rules:true,privacy:true,ts:Date.now()})).toString('base64url');const sig=crypto.createHmac('sha256',secret).update(payload).digest('base64url');return payload+'.'+sig}
export function installLegalPagesHotfix(){
 const original:any=http.Server.prototype.emit;
 (http.Server.prototype as any).emit=function(this:any,event:any,...args:any[]){
  if(event==='request'){
   const req:any=args[0],res:any=args[1],url=String(req.url||'').split('?')[0];
   if(req.method==='GET'&&url==='/privacy'){res.statusCode=200;res.setHeader('content-type','text/html; charset=utf-8');res.end(page('Политика конфиденциальности',PRIVACY));return true}
   if(req.method==='GET'&&url==='/rules'){res.statusCode=200;res.setHeader('content-type','text/html; charset=utf-8');res.end(page('Правила',dropsoRules));return true}
   if(req.method==='POST'&&url==='/legal/accept'){
    let body='';req.on('data',(c:any)=>{body+=c;if(body.length>8192)req.destroy()});req.on('end',()=>{const p=new URLSearchParams(body);if(p.get('terms')!=='yes'||p.get('rules')!=='yes'||p.get('privacy')!=='yes'||p.get('adult')!=='yes'){res.statusCode=400;res.end('Consent required');return}res.statusCode=303;res.setHeader('set-cookie','d1psy_consent='+encodeURIComponent(consentToken())+'; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=31536000');res.setHeader('location','/auth/twitch');res.end()});return true
   }
   if(req.method==='GET'&&(url==='/'||url==='')){
    const oldEnd=res.end.bind(res);res.end=(chunk:any,...rest:any[])=>{if(typeof chunk==='string'&&chunk.includes('id="gate"')){
      chunk=chunk.replace('<span>Я ознакомился и принимаю <a href="/terms" target="_blank" rel="noopener">Пользовательское соглашение</a>.</span>','<span>Я ознакомился и принимаю <a href="/terms" target="_blank" rel="noopener">Пользовательское соглашение</a>.</span></label><label class="check"><input type="checkbox" name="rules" value="yes" id="rules"><span>Я ознакомился и принимаю <a href="/rules" target="_blank" rel="noopener">Правила D1PSY Rewards</a>.</span></label><label class="check"><input type="checkbox" name="privacy" value="yes" id="privacy"><span>Я ознакомился с <a href="/privacy" target="_blank" rel="noopener">Политикой конфиденциальности</a>.</span>');
      chunk=chunk.replace(/const ok=.*?;/,'const ok=()=>go.disabled=!(terms.checked&&rules.checked&&privacy.checked&&adult.checked);');
      chunk=chunk.replace(/\[terms,adult\]/g,'[terms,rules,privacy,adult]');
      chunk=chunk.replace('<span>18+</span>','<a href="/rules">Правила</a><a href="/privacy">Политика конфиденциальности</a><span>18+</span>');
    }return oldEnd(chunk,...rest)};
   }
  }
  return Reflect.apply(original,this,[event,...args])
 }
}
