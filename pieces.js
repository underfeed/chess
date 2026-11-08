// Набор фигур: гладкие симметричные силуэты (кроме коня), объём только мягкими тенями.
// Рисуется в SVG, сетка 45×45, вертикальная ось симметрии x = 22.5.
// Внутри фигур нет линий: форма = один силуэт + градиенты.

let uid = 0;

const PAL = {
  w: {
    stops: ['#ffffff', '#f3f3ef', '#d2d1ca'],
    edge: '#7d7c76',
    detail: '#8a8982',
    shade: '#1d1b12',
    shadeOpacity: 0.2,
  },
  b: {
    stops: ['#6c6966', '#4a4745', '#292726'],
    edge: '#141312',
    detail: '#cfccc5',
    shade: '#000000',
    shadeOpacity: 0.28,
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
    .map((c, i) => `<stop offset="${[0, 0.55, 1][i]}" stop-color="${c}"/>`)
    .join('');
  return `<svg viewBox="2.6 0.9 39.8 40.6" aria-hidden="true"><defs>`
    + `<linearGradient id="${id}f" gradientUnits="userSpaceOnUse" x1="9" y1="0" x2="36" y2="0">${stops}</linearGradient>`
    + `<linearGradient id="${id}s" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="0" y2="40">`
    + `<stop offset="0" stop-color="${p.shade}" stop-opacity="0"/><stop offset="1" stop-color="${p.shade}" stop-opacity="${p.shadeOpacity}"/></linearGradient>`
    + `<clipPath id="${id}c">${s.shapes}</clipPath></defs>`
    // контур одним слоем под заливкой: внутри фигуры линий не остаётся
    + `<g fill="${p.edge}" stroke="${p.edge}" stroke-width="1.5" stroke-linejoin="round">${s.shapes}</g>`
    + `<g fill="url(#${id}f)">${s.shapes}</g>`
    + `<rect x="0" y="0" width="45" height="45" fill="url(#${id}s)" clip-path="url(#${id}c)"/>`
    + (s.details ? `<g fill="${p.detail}" stroke="${p.detail}" stroke-width="1.1" stroke-linecap="round">${s.details}</g>` : '')
    + `</svg>`;
}
