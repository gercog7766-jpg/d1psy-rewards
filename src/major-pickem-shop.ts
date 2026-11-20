const steamEconomyImage = 'https://community.steamstatic.com/economy/image/';
const weaponImagePrefix = 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL';

export const majorPickemShopItems = [
  {name:'SG 553 | Киберсила', cost:1,
    image:weaponImagePrefix+'imcO1qx1Y-s29b_E4c8-QF2WV0-h5ouJscCW6khUz_Wjdntr6Iy6WbgEjA5MlRedctxG5kNKyNbi3sgTfi9oUnyj9234b5n51o7FVairOMAY'},
  {name:'FAMAS | Демонтаж', cost:2,
    image:weaponImagePrefix+'3n5vh7h1I_82jbbdlH_icGliRz-pJs-5lSxa_nBovp3PQw9r9cXuQZwMjXMF0E7YN4ES9loflPu_htQTX3otGyS3_iCNP6ixq_a9cBmFkCHH9'},
  {name:'Револьвер R8 | Кровавая паутина', cost:3,
    image:weaponImagePrefix+'jm4Dv8TRe_c2mcZt6JfKAMWuZxuZi_rdrHny2wkR_sDuHw4muJXuWOwZyAsdzTeNcu0S4ktfkP77htAOPiYlbjXKp8jg9HbM'},
  {name:'P250 | Валентность', cost:4,
    image:weaponImagePrefix+'hzMOwwiNK0OL8PfRSI_-dGmiF09F6ueZhW2fiwUx14zmDnNagcC-WagUkApslQuBYsUW_ktexPry3swPfiogTyyiqkGoXuQius2mt'},
  {name:'Наклейка | Джек', cost:5,
    image:'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJai0ki7VeTHjNm0MnqF41d28bj360n0VBH00Zzh_ikV6fP6P6E4JqOSCDLBx7Yv6LE6GC-xkElz5mTXzt-gJX-TO1AgA8Z0QPlK7Ee7j9FI4g'},
  {name:'AWP | Гадюка', cost:10,
    image:weaponImagePrefix+'wiYbf9Ttk_PyvY6F-K_mdMWuZxuZi_rQ_GS3mxRwk4jvTyNv6eC-RPQV1W5AlTOZb4xLtw9fuNriw51Hd3otbjXKp4cSTTIs'},
  {name:'CZ75-Auto | Поул-позиция', cost:15,
    image:weaponImagePrefix+'yhMG1_B1Y-s2tcvM4H-CBC2SZ0ud5vt5lRi67gVNy4mTdzdmgc33COg90DcB2FuMPtxLpldSxZeLn4w2K34NCzXj9hnsY8G81tCL36RK-'},
  {name:'USP-S | Кровавый тигр', cost:25,
    image:weaponImagePrefix+'kjYbf7itX6vytbbZSKOmsHGKU1edxtfNWQyC0nQlptWWEzd-qd3mVbgR2WZYiFuUMtUG7x4HhYeLhs1fZiN1DnC6viH4Y7TErvbgp6HjWjQ'},
  {name:'M4A4 | Злобный дайме', cost:40,
    image:weaponImagePrefix+'8ypexwiFO0P_6afBSJeaaAliUwOd7qe5WQyC0nQlp4GqGz42ucCqXaQMhDpd4R-AIsxK6ktXgZePltVPXitoRn3-tjCgd6zErvbijVJZd2Q'},
] as const;

const plural = new Intl.PluralRules('ru');

export const majorPickemShop = `<section id="majorShop" class="panel" aria-labelledby="majorShopTitle">
<h2 id="majorShopTitle">Магазин Pick’em</h2>
<p class="muted">Обменивай жетоны на награды Major Dropso.</p>
<ul class="major-shop-grid">${majorPickemShopItems.map(({name,cost,image},index) => {
  const unit = plural.select(cost) === 'one' ? 'жетон' : plural.select(cost) === 'few' ? 'жетона' : 'жетонов';
  return `<li>
    <img class="major-shop-art" src="${steamEconomyImage}${image}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
    <h3>${name}</h3>
    <span class="major-shop-cost"><img src="/predict/major-token.webp" width="19" height="19" alt="">${cost} ${unit}</span><button class="major-shop-buy" data-item-index="${index}" type="button" disabled>Купить</button>
  </li>`;
}).join('')}</ul><p id="majorShopStatus" role="status"></p></section>`;

export const majorPickemShopCss = `
#majorShop{scroll-margin-top:24px}
.major-shop-grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:10px}
.major-shop-grid li{display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-width:0;padding:12px;border:1px solid #654684;border-radius:12px;background:#2a1c3d}
.major-shop-art{width:100%;height:92px;object-fit:contain;background:radial-gradient(ellipse,#50336855,transparent 70%)}
.major-shop-grid h3{margin:0;font-size:15px;overflow-wrap:anywhere}
.major-shop-cost{display:inline-flex;align-items:center;gap:6px;margin-top:auto;padding:4px 8px;border-radius:8px;background:#493059;color:#ffe2a6;font-size:13px;font-weight:700}
.major-shop-cost img{flex:none;object-fit:contain}
`;

export const majorBronzeCaseSection = `<section id="majorCases" class="panel" aria-labelledby="majorCasesTitle">
<h2 id="majorCasesTitle">Кейсы</h2>
<div class="major-case-grid"><article class="major-case-tile">
<div class="bronze-case-art"><img src="/predict/major-bronze-case.webp" alt="Бронзовый кейс Major X Dropso" loading="lazy" decoding="async"></div>
<h3>Бронзовый кейс</h3><p class="muted">Один случайный скин CS2 в инвентарь.</p>
<p class="major-shop-cost"><img src="/predict/major-token.webp" width="19" height="19" alt="">1 жетон</p>
<button id="openBronzeCase" class="primary" type="button" disabled>Открыть кейс</button>
</article></div>
<div id="bronzeRoulette" class="bronze-roulette" hidden aria-label="Открытие кейса"><div id="bronzeStrip" class="bronze-strip"></div><div class="bronze-marker"></div></div>
<p id="bronzeCaseStatus" role="status"></p>
</section>`;
export const majorBronzeCaseCss = `
#majorCases{scroll-margin-top:24px}
.major-case-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:16px;align-items:stretch}
.major-case-tile{min-width:0;display:flex;flex-direction:column;align-items:stretch;gap:9px;padding:15px;border:1px solid #654684;border-radius:14px;background:linear-gradient(155deg,#302039,#20162b)}
.major-case-tile h3{font-size:17px;margin:0;text-align:center}
.major-case-tile .muted{font-size:13px;line-height:1.4;margin:0;text-align:center}
.major-case-tile .major-shop-cost{align-self:center;margin:3px 0}
.major-case-tile button{width:100%;margin-top:auto}
.bronze-case-art{height:178px;width:100%;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,#8b4b3233,transparent 70%)}
.bronze-case-art img{display:block;max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 8px 12px #0008)}
@keyframes bronzeCaseOpen{0%,100%{transform:translateY(0) rotate(0) scale(1);filter:drop-shadow(0 8px 12px #0008)}12%{transform:translateX(-4px) rotate(-2deg)}24%{transform:translateX(5px) rotate(2deg)}36%{transform:translateX(-4px) rotate(-1deg)}52%{transform:translateY(-13px) scale(1.08);filter:drop-shadow(0 0 28px #ffc778)}70%{transform:translateY(-7px) scale(1.04)}}
.bronze-case-opening img{animation:bronzeCaseOpen 1.5s ease-in-out both}
@media(prefers-reduced-motion:reduce){.bronze-case-opening img{animation:none}}
.bronze-roulette{position:relative;overflow:hidden;border:2px solid #bd8957;border-radius:12px;margin:20px 0;background:#130d1a;height:164px}
.bronze-strip{display:flex;gap:8px;align-items:center;height:100%;width:max-content;transform:translateX(0)}
.bronze-slot{flex:none;width:188px;height:144px;display:grid;place-items:center;padding:5px;background:#34243d;border-bottom:3px solid #b68c58;border-radius:7px}
.bronze-slot img{display:block;width:100%;height:100%;min-width:0;min-height:0;object-fit:contain;filter:drop-shadow(0 4px 7px #0009)}
.bronze-slot.bronze-slot-won{border-color:#ffe4a1;box-shadow:inset 0 0 19px #eec36c66;background:#50334a}
@media(max-width:600px){.bronze-roulette{height:128px}.bronze-slot{width:148px;height:108px}}
.bronze-marker{position:absolute;left:50%;top:0;bottom:0;width:3px;background:#ffe7aa;box-shadow:0 0 10px #ffcb73;transform:translateX(-50%);pointer-events:none}
`;
