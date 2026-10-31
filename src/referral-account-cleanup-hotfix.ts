import express from 'express';

export function installReferralAccountCleanupHotfix(){
  const response:any=(express as any).response;
  const originalSend=response.send;
  response.send=function(body:any){
    if(typeof body==='string'&&body.includes('<title>Личный кабинет — d1psy Rewards</title>')){
      const cleanup=`<script>(function(){function cleanReferral(){document.querySelectorAll('#referral,.ref-card').forEach(function(el){el.remove()});document.querySelectorAll('section').forEach(function(el){var h=el.querySelector('h1,h2,h3');if(h&&h.textContent&&h.textContent.trim()==='Реферальная программа')el.remove()});var top=document.querySelector('.topbar,.top,.nav');var shop=document.querySelector('a.shoplink[href="#shop"],a[href="#shop"]');if(shop&&!document.querySelector('a[href="/referrals"]')){var a=document.createElement('a');a.href='/referrals';a.className=shop.className||'shoplink';a.textContent='Рефералы';shop.parentNode&&shop.parentNode.insertBefore(a,shop)}}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',cleanReferral);else cleanReferral();setTimeout(cleanReferral,0);setTimeout(cleanReferral,250);setTimeout(cleanReferral,1000)})();</script>`;
      body=body.replace('</body>',cleanup+'</body>');
    }
    return originalSend.call(this,body);
  };
}
