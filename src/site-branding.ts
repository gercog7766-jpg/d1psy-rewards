export const brandLogoUrl='/pwa/icon/brand-logo.png';
const logo='<img class="d1psy-brand-logo" src="'+brandLogoUrl+'" alt="" width="44" height="44">';
const css=`<style id="d1psyBrandTheme">
.d1psy-brand-logo{display:inline-block;width:44px;height:44px;object-fit:contain;flex:0 0 auto;vertical-align:middle;filter:drop-shadow(0 0 9px #a300ff40)}
.brand:has(>.d1psy-brand-logo),.footer-brand:has(>.d1psy-brand-logo){display:flex;align-items:center;gap:10px}
.brand .mkt-brand-mark,.brand .brandIcon,.brand .brand-mark,.brand .mark{display:flex!important;align-items:center;justify-content:center;background:none!important;border:0!important;box-shadow:none!important;border-radius:0!important;transform:none!important;overflow:visible!important;padding:0!important;width:44px!important;height:44px!important}
.brand .mkt-brand-mark .d1psy-brand-logo,.brand .brandIcon .d1psy-brand-logo,.brand .brand-mark .d1psy-brand-logo{width:100%;height:100%;transform:none}
.footer-brand>.d1psy-brand-logo{width:30px;height:30px}
@media(max-width:580px){.brand>.d1psy-brand-logo,.brand .mkt-brand-mark,.brand .brandIcon,.brand .brand-mark,.brand .mark{width:36px!important;height:36px!important}}
</style>`;
/** Change service branding only. Team logos and user avatars are separate identities. */
export function withSiteBranding(body:string,path=''){
 if(/^\/(?:live|admin\/live)(?:\/|$)/.test(path)||!/^\s*(?:<!doctype html|<html\b)/i.test(body)||body.includes('id="d1psyBrandTheme"'))return body;
 // Never rewrite template strings or selectors embedded in scripts/styles.
 body=body.split(/(<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>)/gi).map((part,i)=>{
  if(i%2)return part;
  part=part.replace(/(<span\b[^>]*class="(?:mkt-brand-mark|brandIcon|brand-mark|mark)"[^>]*>)(?:D1?|<img\b[^>]*><span\b[^>]*>D1<\/span>)(<\/span>)/g,'$1'+logo+'$2');
  part=part.replace(/(<(?:a|div)\b[^>]*class="brand"[^>]*>)(?=D1PSY|d1psy|Забирай дроп)/g,'$1'+logo);
  part=part.replace(/(<div class="footer-brand">)(?=<strong>D1PSY)/g,'$1'+logo);
  part=part.replace(/(<(?:div class="tag"|b)>)(D1PSY REWARDS)(<\/)/g,'$1'+logo+' $2$3');
  return part;
 }).join('');
 const overlay=/^\/(?:obs|streamer\/obs)(?:\/|$)/.test(path)?'<style>.brand>.d1psy-brand-logo,.tag>.d1psy-brand-logo{width:18px;height:18px}</style>':'';
 const head=css+overlay+'<link rel="icon" type="image/png" sizes="48x48" href="/pwa/icon/brand-favicon.png">';
 if(/<\/head>/i.test(body))return body.replace(/<\/head>/i,head+'</head>');
 if(/<body\b/i.test(body))return body.replace(/<body\b/i,head+'<body');
 // Offline template has an implicit head and body.
 return body.replace(/<main\b/i,head+'<main');
}
