// Значки категорий ходов: белые, жирные, заполняют круг. Сетка 24×24, центр (12, 12).
const F = 'fill="#fff" stroke="none"';
const DOT = (x, y) => `<circle cx="${x}" cy="${y}" r="2.3" ${F}/>`;
const BAR = (x) => `<rect x="${x - 2}" y="4" width="4" height="11" rx="2" ${F}/>`;
// «?»: дуга и хвостик. Центр хвостика около x = 11.3 (внутри группы сдвигается).
const HOOK = '<path d="M9.2 9.2 A3 3 0 1 1 13.2 12.1 C12.3 12.5 11.8 13.3 11.8 14.3 V14.8" fill="none"/>';
const Q = (tx, extra = '') => `<g transform="translate(${tx} 0)">${HOOK}${DOT(11.3, 18.8)}${extra}</g>`;

const ICONS = {
  // «!!» — два столбика
  brilliant: BAR(9.2) + BAR(14.8) + DOT(9.2, 18.8) + DOT(14.8, 18.8),
  // «!»
  great: BAR(12) + DOT(12, 18.8),
  // звезда
  best: `<polygon points="12.00,3.00 14.53,8.92 20.94,9.50 16.09,13.73 17.53,20.00 12.00,16.70 6.47,20.00 7.91,13.73 3.06,9.50 9.47,8.92" ${F}/>`,
  // большой палец вверх
  excellent: `<rect x="2.8" y="10.4" width="4.2" height="10" rx="1.4" ${F}/>` +
    `<path d="M8.4 10.6 L11.8 4.4 C12.5 3.2 14.6 3.8 14.3 5.5 L13.5 9.6 H19.2 C20.7 9.6 21.7 11 21.2 12.5 L19.5 18.4 C19.2 19.5 18.2 20.2 17.1 20.2 H8.4 Z" ${F}/>`,
  // галочка
  good: '<path d="M5.6 12.8 L10.1 17.2 L18.6 7.8" fill="none" stroke-width="4"/>',
  // открытая книга
  book: `<path d="M2.8 6.8 C5.6 5.2 8.8 5.3 11.3 7 V19.2 C8.8 17.6 5.6 17.6 2.8 19 Z" ${F}/>` +
    `<path d="M21.2 6.8 C18.4 5.2 15.2 5.3 12.7 7 V19.2 C15.2 17.6 18.4 17.6 21.2 19 Z" ${F}/>`,
  // «?!»
  inaccuracy: `<g transform="translate(-1.8 0)">${HOOK}${DOT(11.3, 18.8)}</g>` + BAR(17.6) + DOT(17.6, 18.8),
  // «?»
  mistake: Q(0.7),
  // «??»
  blunder: Q(-3.6) + Q(5.0),
};

export function catIconSvg(key) {
  const body = ICONS[key] || '';
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#fff" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
