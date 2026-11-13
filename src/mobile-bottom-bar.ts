import express from 'express';

const entries = [
  { href: '/games', label: 'Игры', drawing: 'M7 7h10a4 4 0 0 1 3.8 3l1.2 5a2.7 2.7 0 0 1-4.5 2.7L15 15H9l-2.5 2.7A2.7 2.7 0 0 1 2 15l1.2-5A4 4 0 0 1 7 7Zm0 3v4m-2-2h4m6-1h.01m3 2h.01' },
  { href: '/predict', label: 'Предикты', drawing: 'M4 18v-3m4 3v-7m4 7V6m4 12v-8m4 8v-3' },
  { href: '/upgrader', label: 'Апгрейд', drawing: 'm4 12 8-8 8 8M4 20l8-8 8 8' },
  { href: '/users', label: 'Пользователи', drawing: 'M16 20v-2a4 4 0 0 0-4-4h-2a4 4 0 0 0-4 4v2m16 0v-2a4 4 0 0 0-3-4m-17 6v-2a4 4 0 0 1 3-4m10-6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm3-3a3 3 0 0 1 0 6' },
  { href: '/community', label: 'Сообщения', drawing: 'M20 4H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3v4l5-4h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2ZM7 11h.01m5 0h.01m5 0h.01' },
];

const styles = `<style id="dropso-mobile-bar-style">
#dropso-mobile-bar{display:none}
@media(max-width:650px){
 body[data-dropso-mobile-bar]::after{content:"";display:block;height:calc(85px + env(safe-area-inset-bottom,0px));flex-shrink:0}
 #dropso-mobile-bar{position:fixed;inset:auto 0 0;z-index:1000;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2px;align-items:end;box-sizing:border-box;padding:5px max(3px,env(safe-area-inset-right)) calc(5px + env(safe-area-inset-bottom)) max(3px,env(safe-area-inset-left));border:1px solid #513170;border-radius:20px 20px 0 0;background:#160d22f5;box-shadow:0 -8px 28px #0b0618b0;backdrop-filter:blur(14px)}
 #dropso-mobile-bar a{box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:0;min-height:49px;margin:0;padding:4px 0;color:#d5b1ef;text-decoration:none;text-transform:none;font:650 clamp(9px,2.55vw,13px)/1.2 system-ui;letter-spacing:0;white-space:nowrap;border-radius:12px}
 #dropso-mobile-bar svg{width:23px;height:23px;flex:none}
 #dropso-mobile-bar a[aria-current]{color:#fff;background:#382056}
 #dropso-mobile-bar .upgrade-tab{min-height:61px;margin-top:-13px;color:#fff;border:1px solid #b266ee;border-radius:17px;background:linear-gradient(155deg,#7533b9,#28153e);box-shadow:0 0 14px #9a46df70}
 #dropso-mobile-bar .upgrade-tab svg{width:27px;height:27px}
 #dropso-mobile-bar a:focus-visible{outline:2px solid #f0ceff;outline-offset:-2px}
 @media(max-width:340px){#dropso-mobile-bar a{font-size:9px}}
}
</style>`;

export function withMobileBottomBar(html: string, path: string) {
  const supported = path === '/account' || path === '/shop' || path === '/black-box'
    || path === '/piggy-bank' || path === '/savings' || path === '/notifications'
    || entries.some(entry => path === entry.href || path.startsWith(entry.href + '/'));
  if (!supported || html.includes('id="dropso-mobile-bar"') || !/<body\b[^>]*>/i.test(html)
    || !/<\/body>/i.test(html) || !/<\/head>/i.test(html)) return html;

  const links = entries.map(({href,label,drawing}) => {
    const current = path === href ? ' aria-current="page"' : path.startsWith(href + '/') ? ' aria-current="location"' : '';
    const feature = href === '/upgrader' ? ' class="upgrade-tab"' : '';
    return `<a href="${href}"${current}${feature}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${drawing}"/></svg><span>${label}</span></a>`;
  }).join('');
  const bar = `<nav id="dropso-mobile-bar" aria-label="Быстрые переходы">${links}</nav>`;
  return html.replace(/<\/head>/i, styles + '</head>')
    .replace(/<body\b/i, '<body data-dropso-mobile-bar')
    .replace(/<\/body>/i, bar + '</body>');
}

export function installMobileBottomBar() {
  const response = express.response;
  const send = response.send;
  response.send = function(body) {
    if (typeof body === 'string') body = withMobileBottomBar(body, this.req?.path ?? '');
    return send.call(this, body);
  };
}
