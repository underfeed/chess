// Набор фигур: гладкие симметричные силуэты (кроме коня).
// Рисуется в SVG, сетка 45×45, вертикальная ось симметрии x = 22.5.
// Как в примере: мягкий серп-тень по правому краю внутри силуэта
// (свет слева), спокойная заливка и аккуратная обводка.

let uid = 0;

// Прожилки для «мрамора»: общие для всех фигур, обрезаются по силуэту.
const VEINS = [
  'M3 36 C 11 33, 14 26, 12.5 18 C 11 11, 15 5, 21 2',
  'M27 44 C 24 36, 28 29, 33.5 26 C 38 23, 39 18, 36 13',
  'M8 15 C 14 17.5, 21 15.5, 26 10',
];

const PAL = {
  w: {
    // Светлые: белая заливка, серый серп-тень справа, серая обводка.
    stops: ['#ffffff', '#fdfcf8', '#f4f1e9'],
    edge: '#4a4a4a',
    edgeWidth: 3, // толщина контура под заливкой: наружу выходит половина
    detail: '#3f3f3f',
    inner: '#c8c5bc',
    innerOpacity: 1,
    innerShift: 2.4,
    innerDrop: 0.4,
    innerBlur: 1.2,
    vein: '#b8b2a5',
    veinOpacity: 0.32,
    veinWidth: 0.65,
  },
  b: {
    // Тёмные: графит, тёмный серп-тень справа, почти чёрная обводка.
    stops: ['#4f4e4b', '#4a4946', '#454441'],
    edge: '#1c1b1a',
    edgeWidth: 2.8,
    detail: '#f2efe8',
    inner: '#232120',
    innerOpacity: 1,
    innerShift: 2.4,
    innerDrop: 0.4,
    innerBlur: 1.2,
    vein: '#8b867e',
    veinOpacity: 0.3,
    veinWidth: 0.65,
  },
};

// Собирает симметричный контур из правой половины.
// segs идут сверху вниз от точки (22.5, startY) до (22.5, y_низа); левая сторона зеркалится автоматически.
function sym(startY, segs) {
  let d = `M22.5 ${startY}`;
  let cur = [22.5, startY];
  const rev = [];
  for (const s of segs) {
    if (s[0] === 'L') {
      d += ` L${s[1]} ${s[2]}`;
      rev.push({ t: 'L', from: cur });
      cur = [s[1], s[2]];
    } else {
      d += ` C${s[1]} ${s[2]} ${s[3]} ${s[4]} ${s[5]} ${s[6]}`;
      rev.push({ t: 'C', from: cur, c1: [s[1], s[2]], c2: [s[3], s[4]] });
      cur = [s[5], s[6]];
    }
  }
  const m = (p) => `${(45 - p[0]).toFixed(2)} ${p[1]}`;
  for (let i = rev.length - 1; i >= 0; i--) {
    const r = rev[i];
    d += r.t === 'L' ? ` L${m(r.from)}` : ` C${m(r.c2)} ${m(r.c1)} ${m(r.from)}`;
  }
  return `<path d="${d} Z"/>`;
}

// Общий низ фигуры: плавный переход от тела к круглой подставке.
const TAIL = [
  ['C', 32.8, 33.8, 34.4, 34.4, 34.6, 36],
  ['L', 34.8, 38.4],
  ['C', 34.8, 39.4, 34.2, 40, 33.2, 40],
  ['L', 22.5, 40],
];

const ball = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
const mirrorBall = (x, y, r) => ball(x, y, r) + ball(45 - x, y, r);

const SHAPES = {
  p: () => ({
    shapes: sym(8.4, [
      ['C', 26.1, 8.4, 28.4, 10.5, 28.4, 13.2],
      ['C', 28.4, 15.2, 27.3, 16.7, 25.7, 17.6],
      ['C', 27.4, 18.2, 28.8, 19.2, 28.8, 20.6],
      ['C', 28.8, 21.5, 28, 22.1, 26.6, 22.3],
      ['C', 26.9, 27, 28.6, 30.6, 31.8, 33.6],
      ...TAIL,
    ]),
    details: '',
  }),

  r: () => ({
    shapes: sym(8.2, [
      ['L', 25.4, 8.2], ['L', 25.4, 11], ['L', 27.9, 11], ['L', 27.9, 8.2],
      ['L', 32.6, 8.2], ['L', 32.6, 16.6], ['L', 29.6, 18],
      ['C', 29.4, 23, 29.2, 28.5, 31.8, 33.6],
      ...TAIL,
    ]),
    details: '',
  }),

  n: () => ({
    shapes: `<path d="M12 40 H33.2 C34.2 40 34.8 39.4 34.8 38.4 L34.5 36 C34.3 34.6 33.6 33.9 32.4 33.3
      C35.2 27.4 36.6 20.2 33.4 14.6 C31.4 10.8 27.8 8.2 23.6 8.3 L22.2 6 L20.2 9
      C17.4 10.8 15 13.6 13.6 17.4 C12.4 20.4 11.4 22.4 11.8 24 C12.2 25.4 13.8 25.6 15 24.8
      C16.8 23.6 18.4 22.6 20 22 C18.2 25.8 14.8 28.6 13.2 33.2 C12.1 33.8 11.4 34.6 11.2 36
      L10.2 38.4 C10.2 39.4 10.8 40 12 40 Z"/>`,
    details: '<circle cx="24.2" cy="14.6" r="1.3" stroke="none"/><circle cx="13" cy="21.6" r="0.9" stroke="none"/>',
  }),

  b: () => ({
    shapes: sym(5.8, [
      ['C', 23.7, 5.8, 24.7, 6.8, 24.7, 8],
      ['C', 24.7, 8.8, 24.2, 9.4, 23.6, 9.9],
      ['C', 28.2, 12.2, 30.4, 16.2, 28, 19.8],
      ['C', 29.8, 20.2, 30.4, 21.3, 29.6, 22.4],
      ['C', 28.8, 23, 27.4, 23.1, 26.4, 23.1],
      ['C', 26.3, 27.4, 28.5, 30.8, 31.8, 33.6],
      ...TAIL,
    ]),
    details: '<path d="M21.2 13.2 L24.4 16.4" fill="none"/>',
  }),

  q: () => ({
    shapes: sym(9.6, [
      ['L', 25.2, 18.4], ['L', 28.2, 10.8], ['L', 30, 19], ['L', 33.8, 12.6],
      ['C', 34.4, 17.8, 32.6, 21.8, 30.2, 25],
      ['C', 28.4, 26.8, 28.4, 30, 31.8, 33.6],
      ...TAIL,
    ]) + ball(22.5, 6.6, 2.5) + mirrorBall(28.1, 8.4, 2.3) + mirrorBall(33.9, 10.4, 2.3),
    details: '',
  }),

  k: () => ({
    shapes: sym(13.4, [
      ['C', 27.2, 13.4, 31.2, 16, 31.2, 20.2],
      ['C', 31.2, 22.4, 29.8, 24, 28.2, 25],
      ['C', 28.8, 25.6, 29.1, 26.4, 29.1, 27.2],
      ['C', 29.1, 28.1, 28.4, 28.8, 27.4, 29],
      ['C', 27.7, 30.8, 29.4, 32.3, 31.8, 33.6],
      ...TAIL,
    ]) + '<rect x="21" y="2.6" width="3" height="11.4" rx="1.2"/><rect x="17.8" y="5.2" width="9.4" height="3.2" rx="1.2"/>',
    details: '',
  }),
};

export function pieceSvg(type, color) {
  const p = PAL[color === 'w' ? 'w' : 'b'];
  const s = (SHAPES[type] || SHAPES.p)();
  const id = 'pc' + (++uid); // уникальные id: иначе градиенты ломаются, если первый svg скрыт
  const stops = p.stops
    .map((c, i) => `<stop offset="${[0, 0.5, 1][i]}" stop-color="${c}"/>`)
    .join('');
  // Серп-тень как в примере: копия силуэта, сдвинутая влево, вычитается из него же —
  // остаётся мягкая полоса вдоль правого края внутри фигуры (свет слева).
  return `<svg viewBox="2.6 0.9 39.8 40.6" aria-hidden="true"><defs>`
    + `<linearGradient id="${id}f" gradientUnits="userSpaceOnUse" x1="22.5" y1="2" x2="22.5" y2="41">${stops}</linearGradient>`
    + `<filter id="${id}i" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">`
    + `<feOffset in="SourceAlpha" dx="-${p.innerShift}" dy="${p.innerDrop}" result="o"/>`
    + `<feGaussianBlur in="o" stdDeviation="${p.innerBlur}" result="b"/>`
    + `<feComposite in="SourceAlpha" in2="b" operator="out" result="r"/>`
    + `<feFlood flood-color="${p.inner}" flood-opacity="${p.innerOpacity}" result="c"/>`
    + `<feComposite in="c" in2="r" operator="in"/></filter>`
    // Мраморные прожилки: пара тонких мягких линий, обрезанных по силуэту.
    + `<clipPath id="${id}c">${s.shapes}</clipPath>`
    + `<filter id="${id}v" x="-10%" y="-10%" width="120%" height="120%">`
    + `<feGaussianBlur stdDeviation="0.35"/></filter></defs>`
    // контур одним слоем под заливкой: внутри фигуры линий не остаётся
    + `<g fill="${p.edge}" stroke="${p.edge}" stroke-width="${p.edgeWidth}" stroke-linejoin="round" stroke-linecap="round">${s.shapes}</g>`
    + `<g fill="url(#${id}f)">${s.shapes}</g>`
    + `<g clip-path="url(#${id}c)" filter="url(#${id}v)" fill="none" stroke="${p.vein}" stroke-width="${p.veinWidth}" stroke-linecap="round" opacity="${p.veinOpacity}">`
    + VEINS.map((d) => `<path d="${d}"/>`).join('')
    + `</g>`
    + `<g filter="url(#${id}i)">${s.shapes}</g>`
    + (s.details ? `<g fill="${p.detail}" stroke="${p.detail}" stroke-width="1.6" stroke-linecap="round">${s.details}</g>` : '')
    + `</svg>`;
}
