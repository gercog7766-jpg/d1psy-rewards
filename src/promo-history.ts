import type { SupabaseClient } from '@supabase/supabase-js';
import type { Express, RequestHandler } from 'express';
import { promoRewardTypes } from './promo-rewards.js';

const pageSize = 50;
const promoIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

type Redemption = {
  created_at: string;
  reward_type: string;
  coin_amount: number | null;
  reward_amount: number | null;
  player: { twitch_login: string | null; twitch_display_name: string | null } | null;
  prize: { name: string | null } | null;
};

const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeText(text: string) {
  return text.replace(/[&<>"']/g, char => entities[char]);
}

function rewardText(receipt: Redemption) {
  const type = receipt.reward_type;
  const label = Object.hasOwn(promoRewardTypes, type)
    ? promoRewardTypes[type as keyof typeof promoRewardTypes] : 'Награда';
  const details = receipt.prize?.name || receipt.coin_amount || receipt.reward_amount;
  return details == null ? label : label + ' · ' + details;
}

function renderHistory(code: string, receipts: Redemption[], total: number, page: number) {
  const rows = receipts.map(receipt => {
    const login = receipt.player?.twitch_login;
    const name = receipt.player?.twitch_display_name || login || 'Пользователь недоступен';
    const timestamp = new Date(receipt.created_at).toISOString();
    return `<tr><th scope="row">${escapeText(name)}${login ? `<small>@${escapeText(login)}</small>` : ''}</th>
<td><time datetime="${timestamp}">${timestamp.slice(0,16).replace('T',' ')} UTC</time></td>
<td>${escapeText(rewardText(receipt))}</td></tr>`;
  }).join('');

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>История активаций · Dropso</title><style>
*{box-sizing:border-box}body{margin:0;background:#130d1d;color:#f8efff;font:16px/1.5 system-ui}
main{max-width:940px;margin:auto;padding:24px 16px 48px}h1{margin:18px 0 4px;overflow-wrap:anywhere;font-size:clamp(28px,5vw,40px)}
a{color:#e4baff}a:focus-visible,.table-scroll:focus-visible{outline:2px solid #efd5ff;outline-offset:3px}
p,small{color:#beaccd}p{margin:0 0 18px}.table-scroll{overflow:auto;border:1px solid #6b4786;border-radius:12px}
table{width:100%;min-width:480px;border-collapse:collapse;background:#20162c}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #55396e}
tbody th{overflow-wrap:anywhere}th small{display:block;font-weight:400}thead{background:#35224a}
tbody tr:last-child>*{border-bottom:0}time{white-space:nowrap;font-variant-numeric:tabular-nums}
nav{display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin-top:16px}
</style></head><body><main>
<a href="/admin#promoAdminTab">← Промокоды</a><h1>${escapeText(code)}</h1>
<p id="historyCaption">История активаций · всего ${total}</p>
<div class="table-scroll" tabindex="0" role="region" aria-labelledby="historyCaption">
<table aria-labelledby="historyCaption"><thead><tr><th scope="col">Игрок</th><th scope="col">Время</th><th scope="col">Награда</th></tr></thead>
<tbody>${rows || '<tr><td colspan="3">На этой странице нет активаций.</td></tr>'}</tbody></table></div>
${page > 1 || total > pageSize ? `<nav aria-label="Страницы активаций">
${page > 1 ? `<a href="?page=${page - 1}" rel="prev">← Назад</a>` : ''}
<span>Страница ${page}</span>${total > page * pageSize ? `<a href="?page=${page + 1}" rel="next">Дальше →</a>` : ''}</nav>` : ''}
<script>
const format = new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'});
for (const time of document.querySelectorAll('time')) time.textContent = format.format(new Date(time.dateTime));
</script></main></body></html>`;
}

export function installPromoHistory(app: Express, db: SupabaseClient, admin: RequestHandler) {
  app.get('/admin/promos/:id/redemptions', (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  }, admin, async (req, res) => {
    const id = String(req.params.id);
    const pageParam = req.query.page ?? '1';
    if (!promoIdPattern.test(id) || typeof pageParam !== 'string' || !/^[1-9]\d{0,5}$/.test(pageParam)) {
      res.status(400).type('text').send('Некорректный промокод или номер страницы.');
      return;
    }
    const {data: promo, error: promoError} = await db.from('rewards_promo_codes').select('code').eq('id', id).maybeSingle();
    if (promoError) {
      console.error('promo_history_campaign', promoError.code);
      res.status(503).type('text').send('Не удалось загрузить промокод.');
      return;
    }
    if (!promo) {
      res.status(404).type('text').send('Промокод не найден.');
      return;
    }

    const page = Number(pageParam);
    const from = (page - 1) * pageSize;
    const {data, count, error} = await db.from('rewards_promo_redemptions')
      .select('created_at,reward_type,coin_amount,reward_amount,player:rewards_users!rewards_promo_redemptions_user_id_fkey(twitch_login,twitch_display_name),prize:rewards_prizes!rewards_promo_redemptions_prize_id_fkey(name)', {count:'exact'})
      .eq('promo_id', id).order('created_at', {ascending:false}).order('id')
      .range(from, from + pageSize - 1).returns<Redemption[]>();
    if (error?.code === 'PGRST103' && page > 1) {
      res.redirect('?page=1');
      return;
    }
    if (error && error.code !== 'PGRST103') {
      console.error('promo_history_receipts', error.code);
      res.status(503).type('text').send('Не удалось загрузить активации.');
      return;
    }
    res.send(renderHistory(promo.code, data ?? [], count ?? 0, page));
  });
}
