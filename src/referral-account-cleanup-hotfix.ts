import express from 'express';
export function referralAccountLink(body:string){
 const link='<a id="referralsAccountLink" class="shoplink" href="/referrals">Рефералы</a>';
 if(!/<a\b[^>]*href=["']\/referrals["']/.test(body))body=body.replace(/(<a\b[^>]*href=["'](?:\/shop|#shop)["'][^>]*>[\s\S]*?<\/a>)/,`$1${link}`);
 const script=`<script id="referralsAccountNav">(()=>{function mount(){if(document.querySelector('a[href="/referrals"]'))return;const next=document.getElementById('gamesLink')||document.querySelector('a[href="/shop"],a[href="#shop"]');const host=next?.parentElement||document.querySelector('.economybar,.profile-actions,nav');if(!host)return;const a=document.createElement('a');a.id='referralsAccountLink';a.className='shoplink';a.href='/referrals';a.textContent='Рефералы';if(next)next.after(a);else host.append(a)}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();setTimeout(mount,300)})();</script>`;
 if(!body.includes('id="referralsAccountNav"'))body=body.replace('</body>',script+'</body>');return body;
}
export function installReferralAccountCleanupHotfix(){const response:any=(express as any).response,send=response.send;response.send=function(body:any){if(typeof body==='string'&&this.req?.path==='/account')body=referralAccountLink(body);return send.call(this,body)}}
