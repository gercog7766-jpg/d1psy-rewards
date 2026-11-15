export const majorMedals = [
  null,
  { name:'Бронза', image:'/predict/major-medals/bronze.webp' },
  { name:'Серебро', image:'/predict/major-medals/silver.webp' },
  { name:'Золото', image:'/predict/major-medals/gold.webp' },
  { name:'Бриллиант', image:'/predict/major-medals/diamond.webp' },
  { name:'Бриллиант внутри', image:'/predict/major-medals/diamond-core.webp' },
] as const;

export const majorProfileMedalCss = `
.major-profile-medal{display:inline-flex;align-items:center;gap:8px;max-width:100%;min-height:42px;padding:4px 10px 4px 6px;border:1px solid #966ac285;border-radius:9px;background:#342044;color:#f2dbff;font-size:13px;font-weight:700;line-height:1.25}
.major-profile-medal img{width:30px;height:34px;object-fit:contain;flex:none}
`;
