export const majorPickemAdminPath = '/admin/major-pickem';

export type MajorPickemEntrant = {
  tokens: number;
  player: { twitch_login: string | null; twitch_display_name: string | null } | null;
  picks: { stage: number }[];
};

const stages = ['Stage 1', 'Stage 2', 'Stage 3', 'Плей-офф'];
const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeText(value: string) {
  return value.replace(/[&<>"']/g, char => entities[char]);
}

export function majorPickemAdminPage(entries: MajorPickemEntrant[], page: number, hasNext: boolean) {
  const rows = entries.map(({player, picks, tokens}) => {
    const login = player?.twitch_login;
    const name = player?.twitch_display_name || login || 'Без имени';
    const saved = new Set(picks.map(pick => pick.stage));
    return `<tr><th scope="row">${escapeText(name)}${login ? `<small>@${escapeText(login)}</small>` : ''}</th>${
      stages.map((_, index) => saved.has(index + 1)
        ? '<td class="saved">Сохранён</td>'
        : '<td class="muted">—</td>').join('')
    }<td class="tokens">${tokens}</td></tr>`;
  }).join('');

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Major Pick’em · Админка Dropso</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#130d1d;color:#f8efff;font:16px/1.5 system-ui}
main{max-width:1080px;margin:auto;padding:24px 16px 48px}h1{margin:18px 0 4px;font-size:clamp(28px,5vw,40px)}
a{color:#e4baff}a:focus-visible,.table-scroll:focus-visible{outline:2px solid #efd5ff;outline-offset:3px}
.muted,small{color:#beaccd}p{margin:0 0 18px}.table-scroll{overflow:auto;border:1px solid #6b4786;border-radius:12px}
table{width:100%;min-width:620px;border-collapse:collapse;background:#20162c}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #55396e}
tbody th{max-width:220px;overflow-wrap:anywhere}th small{display:block;font-weight:400}thead{background:#35224a}
tr:last-child>*{border-bottom:0}.saved{color:#9de6bb}.tokens{font-weight:750;font-variant-numeric:tabular-nums}
nav{display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin-top:16px}
</style></head><body><main>
<a href="/admin">← Админка</a><h1>Major Pick’em</h1>
<p class="muted" id="participants">Участники с пропуском · сохранённые прогнозы и баланс жетонов</p>
<div class="table-scroll" tabindex="0" role="region" aria-labelledby="participants">
<table aria-labelledby="participants"><thead><tr><th scope="col">Игрок</th>${stages.map(stage => `<th scope="col">${stage}</th>`).join('')}<th scope="col">Жетоны</th></tr></thead>
<tbody>${rows || `<tr><td colspan="6">${page === 1 ? 'Пока никто не купил пропуск.' : 'На этой странице нет участников.'}</td></tr>`}</tbody></table></div>
${page > 1 || hasNext ? `<nav aria-label="Страницы участников">${page > 1 ? `<a href="?page=${page - 1}" rel="prev">← Назад</a>` : ''}<span>Страница ${page}</span>${hasNext ? `<a href="?page=${page + 1}" rel="next">Дальше →</a>` : ''}</nav>` : ''}
</main></body></html>`;
}
