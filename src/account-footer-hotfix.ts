import express from 'express';

const RULES_HTML = `
<div class="legal-modal" id="rulesModal" aria-hidden="true">
  <div class="legal-backdrop" data-close-rules></div>
  <section class="legal-panel" role="dialog" aria-modal="true" aria-labelledby="rulesTitle">
    <button class="legal-close" type="button" data-close-rules aria-label="Закрыть">×</button>
    <h2 id="rulesTitle">Правила D1PSY Rewards</h2>
    <p><strong>1. Общие положения.</strong> D1PSY Rewards — бонусная программа для зрителей сообщества D1PSY. Участие добровольное и доступно только пользователям старше 18 лет. Используя сервис, пользователь подтверждает согласие с настоящими правилами и действующей политикой сервиса.</p>
    <p><strong>2. Один пользователь — один аккаунт.</strong> Запрещены твинки, мультиаккаунты, передача аккаунта для обхода ограничений, создание дополнительных учётных записей для повторного получения наград, заданий, бонусов или иных преимуществ. Связанные аккаунты могут быть заблокированы, а полученные с нарушением награды — аннулированы.</p>
    <p><strong>3. Честное использование.</strong> Запрещены абьюз механик, эксплуатация багов и уязвимостей, автоматизация действий, боты, скрипты, вмешательство в работу сервиса, манипуляции с заданиями, дропами, апгрейдами, балансом, Battle Pass и любыми другими механиками. Обнаруженную ошибку нельзя использовать для получения выгоды. При выявлении нарушений администрация вправе ограничить или заблокировать доступ, отменить операции и аннулировать неправомерно полученные награды, прогресс или баланс.</p>
    <p><strong>4. Выдача призов.</strong> Передача цифровых предметов производится вручную и может занимать до <strong>21 календарного дня</strong> с момента корректного оформления получения приза. Ручная обработка используется в том числе для снижения риска кражи аккаунтов и злоупотреблений через сторонние API. Пользователь обязан предоставить действительную Steam Trade URL и обеспечить возможность получения обмена. Ограничения Steam, Trade Lock, блокировки, неверная ссылка или иные обстоятельства на стороне пользователя/Steam могут увеличить фактический срок до момента, когда передача станет технически возможной.</p>
    <p><strong>5. Проверка спорных операций.</strong> При подозрении на мошенничество, абьюз, эксплуатацию ошибки, мультиаккаунтинг или иное нарушение выдача приза и операции по аккаунту могут быть временно приостановлены на время проверки. Данные сервиса, журнал операций и технические события используются для проверки спорной ситуации.</p>
    <p><strong>6. Награды и внутренняя экономика.</strong> Монеты, XP, SP, уровни, бонусы и иные внутренние единицы предназначены для использования внутри D1PSY Rewards, если прямо не указано иное. Ошибочно начисленные значения могут быть скорректированы. Награды, полученные вследствие технической ошибки или нарушения правил, могут быть отменены.</p>
    <p><strong>7. Технические работы.</strong> Отдельные функции могут временно быть недоступны из-за обновлений, сбоев Twitch, Steam или иных внешних сервисов. Администрация вправе исправлять очевидные технические ошибки и восстанавливать корректное состояние аккаунтов и операций.</p>
    <p><strong>8. Блокировка.</strong> Существенное или повторное нарушение правил, попытка обмана, использование твинков, эксплойтов или абьюза может привести к временной либо постоянной блокировке участия в D1PSY Rewards и аннулированию результатов, полученных с нарушением.</p>
    <p><strong>9. Изменения правил.</strong> Правила могут обновляться по мере развития сервиса. Актуальная редакция публикуется в D1PSY Rewards и применяется к дальнейшему использованию сервиса после публикации.</p>
    <p class="legal-note">Правила не ограничивают права пользователя, которые не могут быть ограничены применимым законодательством.</p>
  </section>
</div>`;

const CSS=`<style id="d1psyFooterStyles">.d1psy-footer{max-width:1040px;margin:18px auto 0;padding:24px;border-top:1px solid #51336f;color:#a99dbb}.footer-inner{display:flex;align-items:center;justify-content:space-between;gap:22px;flex-wrap:wrap}.footer-brand{display:flex;align-items:center;gap:10px;color:#eee}.age-mark{display:inline-flex;align-items:center;justify-content:center;min-width:38px;height:38px;padding:0 7px;border:1px solid #8b5cf6;border-radius:50%;color:#fff;font-weight:900}.footer-links{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.footer-links a,.footer-links button{background:none!important;border:0!important;padding:0!important;color:#c4b5fd!important;text-decoration:none;cursor:pointer;font:inherit}.footer-links a:hover,.footer-links button:hover{text-decoration:underline}.footer-social{display:flex;gap:10px}.footer-social a{display:flex!important;width:40px;height:40px;padding:0!important;border-radius:10px!important;overflow:hidden;background:#20162e!important;align-items:center;justify-content:center}.footer-social img{width:100%;height:100%;object-fit:cover}.footer-copy{font-size:12px;margin-top:14px;color:#746b80}.legal-modal{display:none;position:fixed;inset:0;z-index:99999}.legal-modal.open{display:block}.legal-backdrop{position:absolute;inset:0;background:rgba(5,3,9,.82);backdrop-filter:blur(4px)}.legal-panel{position:relative;z-index:1;width:min(820px,calc(100% - 28px));max-height:84vh;overflow:auto;margin:8vh auto;padding:28px;border:1px solid #3b3150;border-radius:18px;background:#15101e;box-shadow:0 24px 80px rgba(0,0,0,.55);line-height:1.55}.legal-panel h2{margin-top:0;color:#fff}.legal-panel p{color:#d2c9dd}.legal-panel strong{color:#fff}.legal-close{position:absolute;right:14px;top:12px;width:38px;height:38px;padding:0!important;border-radius:10px;background:#312444!important;color:#fff;border:0;font-size:24px;cursor:pointer}.legal-note{font-size:13px;color:#9b90a9!important;border-top:1px solid #302440;padding-top:14px}.legal-lock{overflow:hidden}@media(max-width:700px){.d1psy-footer{padding:20px 16px}.footer-inner{align-items:flex-start;flex-direction:column}.legal-panel{margin:3vh auto;max-height:90vh;padding:22px 18px}}</style>`;
const FOOTER=`<footer id="d1psyFooter" class="d1psy-footer"><div class="footer-inner"><div class="footer-brand"><strong>D1PSY Rewards</strong><span class="age-mark">18+</span></div><nav class="footer-links"><a href="/privacy">Политика конфиденциальности</a><button type="button" id="openRules">Правила</button><span>Только для пользователей 18+</span></nav><div class="footer-social"><a href="https://t.me/d1psy_off" target="_blank" rel="noopener noreferrer" aria-label="Telegram D1PSY"><img src="https://img.magnific.com/premium-vector/telegram-vector-logo-icon-logo-lototype-social-media-icon_901408-466.jpg?semt=ais_hybrid&w=740&q=80" alt="Telegram"></a><a href="https://www.twitch.tv/d1psy_off" target="_blank" rel="noopener noreferrer" aria-label="Twitch D1PSY"><img src="https://cdn-icons-png.flaticon.com/512/3621/3621451.png" alt="Twitch"></a></div></div><div class="footer-copy">© ${new Date().getFullYear()} D1PSY Rewards</div></footer>${RULES_HTML}`;
const SCRIPT=`<script id="d1psyFooterScript">(()=>{const m=document.getElementById('rulesModal'),o=document.getElementById('openRules');if(!m||!o)return;const open=()=>{m.classList.add('open');m.setAttribute('aria-hidden','false');document.body.classList.add('legal-lock')};const close=()=>{m.classList.remove('open');m.setAttribute('aria-hidden','true');document.body.classList.remove('legal-lock')};o.addEventListener('click',open);m.querySelectorAll('[data-close-rules]').forEach(x=>x.addEventListener('click',close));document.addEventListener('keydown',e=>{if(e.key==='Escape')close()})})();</script>`;

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
            if(body.includes('</body>')) body=body.replace('</body>',FOOTER+SCRIPT+'</body>');
          }
          return originalSend(body);
        };
        return handler(req,res,next);
      });
    }
    return originalGet.call(this,path,...handlers);
  };
}
