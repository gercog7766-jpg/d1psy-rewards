import express from 'express';

const styles = `<style id="dropso-dialog-style">
#dropso-dialog{box-sizing:border-box;width:min(440px,calc(100% - 32px));max-height:calc(100% - 32px);margin:auto;padding:24px;border:1px solid #8855b2;border-radius:20px;background:linear-gradient(145deg,#241632,#15101d);color:#f7efff;box-shadow:0 24px 80px #000a;font:16px/1.5 system-ui}
#dropso-dialog::backdrop{background:#090610bb}
#dropso-dialog h2{margin:0 0 8px;color:inherit;font-size:22px}
#dropso-dialog p{margin:0;color:#e1d2ed;white-space:pre-wrap;overflow-wrap:anywhere}
#dropso-dialog .dropso-dialog-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px;margin-top:22px}
#dropso-dialog button{box-sizing:border-box;min-height:44px;padding:9px 18px;border:1px solid #8153a4;border-radius:11px;background:#31213e;color:#fff;font:inherit;font-weight:700;cursor:pointer}
#dropso-dialog button[value="accept"]{background:#7435c2;border-color:#a66be2}
#dropso-dialog button:focus-visible{outline:2px solid #e9c9ff;outline-offset:3px}
@media(max-width:480px){#dropso-dialog{padding:18px}#dropso-dialog button:not([hidden]){flex:1 1 105px}}
</style>`;

const script = `<script id="dropso-dialog-script">
(() => {
  let active = false;
  const notices = [];

  function open(message, confirm, options = {}) {
    return new Promise(resolve => {
      const previous = document.activeElement;
      const dialog = document.createElement('dialog');
      dialog.id = 'dropso-dialog';
      dialog.setAttribute('aria-labelledby', 'dropso-dialog-title');
      dialog.setAttribute('aria-describedby', 'dropso-dialog-message');
      dialog.innerHTML = '<form method="dialog"><h2 id="dropso-dialog-title"></h2><p id="dropso-dialog-message"></p><div class="dropso-dialog-actions"><button type="submit" value="cancel">Отмена</button><button type="submit" value="accept"></button></div></form>';
      dialog.querySelector('h2').textContent = options.title || (confirm ? 'Подтвердите действие' : 'Уведомление');
      dialog.querySelector('p').textContent = String(message ?? '');
      const cancel = dialog.querySelector('[value="cancel"]');
      const accept = dialog.querySelector('[value="accept"]');
      cancel.hidden = !confirm;
      accept.textContent = options.accept || (confirm ? 'Подтвердить' : 'Закрыть');
      (confirm ? cancel : accept).autofocus = true;
      active = true;
      dialog.addEventListener('close', () => {
        const accepted = dialog.returnValue === 'accept';
        dialog.remove();
        active = false;
        if (previous?.isConnected) previous.focus();
        resolve(accepted);
        showNextNotice();
      }, {once:true});
      document.body.append(dialog);
      dialog.showModal();
    });
  }

  function showNextNotice() {
    if (active || !notices.length) return;
    const {message, options} = notices.shift();
    void open(message, false, options);
  }

  window.dropsoConfirm = (message, options) => active ? Promise.resolve(false) : open(message, true, options);
  window.dropsoNotice = (message, options) => {
    notices.push({message, options});
    showNextNotice();
  };
})();
</script>`;

export function installSiteDialogs() {
  const response = express.response;
  const send = response.send;
  response.send = function (body) {
    if (typeof body === 'string' && /^\s*(?:<!doctype html|<html\b)/i.test(body)
      && body.includes('</head>') && !body.includes('id="dropso-dialog-script"')) {
      body = body.replace('</head>', () => styles + script + '</head>');
    }
    return send.call(this, body);
  };
}
