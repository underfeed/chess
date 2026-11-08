// Значки категорий ходов. Рисуются SVG, поэтому всегда по центру и без засечек шрифта.
// Все фигуры нарисованы в сетке 24×24, центр = (12, 12).

const DOT = (x, y) => `<circle cx="${x}" cy="${y}" r="2.1" fill="#fff" stroke="none"/>`;
// «?» с центром около x=12, без засечек: дуга плюс хвостик
const HOOK = '<path d="M10.2 9.6 A2.8 2.8 0 1 1 13.8 12.3 C13.0 12.6 12.5 13.3 12.5 14.2 V14.8"/>';

const ICONS = {
  brilliant: `<path d="M10 6.5 V14 M14 6.5 V14"/>${DOT(10, 18.5)}${DOT(14, 18.5)}`,
  great: `<path d="M12 6.5 V14"/>${DOT(12, 18.5)}`,
  best: '<polygon points="12,3.8 14.5,9.1 20.2,9.7 15.9,13.5 17.1,19.2 12,16.3 6.9,19.2 8.1,13.5 3.8,9.7 9.5,9.1" fill="#fff" stroke="none"/>',
  excellent: '<path d="M12 7.5 V16.5 M7.5 12 H16.5"/>',
  good: '<path d="M7.5 12.5 L10.8 15.8 L16.5 9.2"/>',
  book: '<path d="M7.5 8 H16.5 M7.5 12 H16.5 M7.5 16 H16.5"/>',
  inaccuracy: `<g transform="translate(-1.5 0)">${HOOK}${DOT(12, 18.5)}</g><path d="M17 8.5 V14.5"/>${DOT(17, 18.5)}`,
  mistake: HOOK + DOT(12, 18.5),
  blunder: `<g transform="translate(-4 0)">${HOOK}${DOT(12, 18.5)}</g><g transform="translate(4 0)">${HOOK}${DOT(12, 18.5)}</g>`,
};

export function catIconSvg(key) {
  const body = ICONS[key] || '';
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
