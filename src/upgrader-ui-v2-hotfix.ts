import express from 'express';

const EXTRA=`<style id="upgraderUiV2">
.wheel{overflow:visible!important;background:#171020!important;border:1px solid #3f2a55}.wheel:after{content:'';position:absolute;inset:8px;border-radius:50%;border:14px solid #24182f;border-top-color:#7c3aed;border-right-color:#7c3aed55;z-index:0}.wheel.spin{animation:none!important}.up-needle{position:absolute;z-index:5;left:50%;top:-16px;width:4px;height:151px;transform-origin:50% 151px;transform:translateX(-50%) rotate(0deg);pointer-events:none}.up-needle:before{content:'';position:absolute;left:50%;top:0;transform:translateX(-50%);width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;border-top:26px solid #fcd34d;filter:drop-shadow(0 0 8px #f59e0b)}.up-needle:after{content:'';position:absolute;left:50%;top:21px;transform:translateX(-50%);width:3px;height:22px;background:#fcd34d;box-shadow:0 0 8px #f59e0b}.grid{scrollbar-width:thin;scrollbar-color:#604278 transparent;padding-right:4px}.grid::-webkit-scrollbar{width:7px}.grid::-webkit-scrollbar-track{background:transparent}.grid::-webkit-scrollbar-thumb{background:linear-gradient(#6d28d9,#4c1d95);border-radius:999px}.grid::-webkit-scrollbar-thumb:hover{background:#7c3aed}.up-error{color:#fca5a5!important}
</style>`;

export function installUpgraderUiV2Hotfix(){
 const response:any=(express as any).response;if(response.__upgraderUiV2)return;response.__upgraderUiV2=true;const original=response.send;
 response.send=function(body:any){
  if(typeof body==='string'&&body.includes('<title>Апгрейдер — d1psy Rewards</title>')&&!body.includes('upgraderUiV2')){
   body=body.replace('</head>',EXTRA+'</head>').replace('<div id="wheel" class="wheel"><div class="chance">','<div id="wheel" class="wheel"><div id="needle" class="up-needle"></div><div class="chance">');
  }
  if(typeof body==='string'&&body.includes("fetch('/api/me/upgrader/run'")){
   body=body.replace("$('wheel').classList.remove('spin');void $('wheel').offsetWidth;$('wheel').classList.add('spin');var r=await fetch", "var nd=$('needle');if(nd){nd.style.transition='none';nd.style.transform='translateX(-50%) rotate(0deg)';void nd.offsetWidth;nd.style.transition='transform 1.35s cubic-bezier(.12,.72,.12,1)'}var r=await fetch");
   body=body.replace("j=await r.json().catch(()=>({}));await new Promise(x=>setTimeout(x,950));busy=false;if(!r.ok){alert(j.error||'upgrade_failed');render();return}", "j=await r.json().catch(()=>({}));if(nd){var rb=Number(j.rollBps);var deg=1080+(Number.isFinite(rb)?rb/10000*360:180);nd.style.transform='translateX(-50%) rotate('+deg+'deg)'}await new Promise(x=>setTimeout(x,1400));busy=false;if(!r.ok){var em={source_not_available:'Этот предмет уже нельзя использовать.',source_already_used:'Этот предмет уже использован в апгрейдере.',target_not_available:'Целевой предмет недоступен.',target_variant_not_available:'Выбранный вариант недоступен.',target_must_be_more_expensive:'Выберите более дорогой предмет.',chance_too_low:'Шанс апгрейда слишком мал.',upgrade_failed:'Не удалось выполнить апгрейд. Попробуйте ещё раз.'}[j.error]||'Не удалось выполнить апгрейд.';$('resultIcon').textContent='!';$('resultTitle').textContent='Ошибка апгрейда';$('resultText').textContent=em;$('resultText').classList.add('up-error');$('result').classList.add('on');render();return}$('resultText').classList.remove('up-error');");
   body=body.replace("$('result').classList.remove('on')", "$('result').classList.remove('on');var rn=$('needle');if(rn){rn.style.transition='none';rn.style.transform='translateX(-50%) rotate(0deg)';void rn.offsetWidth}");
  }
  return original.call(this,body);
 };
}
