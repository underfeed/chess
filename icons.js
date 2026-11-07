// Значки категорий ходов. Рисуются SVG, поэтому всегда по центру и без засечек шрифта.
// Все фигуры нарисованы в сетке 24×24, центр = (12, 12).

const DOT = (x, y) => `<circle cx="${x}" cy="${y}" r="2.1" fill="#fff" stroke="none"/>`;
// Жирный и ровный вопросительный знак для ошибок/неточностей
const HOOK = '<path d="M9.5 8.8 A2.6 2.6 0 1 1 14.5 11.5 C14.5 13.2 12 13.8 12 15.5"/>';

const ICONS = {
  brilliant: `<path d="M9.5 5.5 V13.5 M14.5 5.5 V13.5"/>${DOT(9.5, 18.5)}${DOT(14.5, 18.5)}`,
  great: `<path d="M12 5.5 V13.5"/>${DOT(12, 18.5)}`,
  best: '<polygon points="12,3.0 14.8,9.2 21.2,9.9 16.4,14.1 17.8,20.5 12,17.1 6.2,20.5 7.6,14.1 2.8,9.9 9.2,9.2" fill="#fff" stroke="none"/>',
  excellent: '<path d="M6.0 12 H18.0 M12 6.0 V18.0"/>',
  good: '<path d="M6.5 12.5 L10.2 16.2 L17.5 8.2"/>',
  book: '<path d="M6.0 7.2 H18.0 M6.0 12 H18.0 M6.0 16.8 H18.0"/>',
  inaccuracy: `<g transform="translate(-1.8 0)">${HOOK}${DOT(12, 18.5)}</g><path d="M17.5 7.5 V13.5"/>${DOT(17.5, 18.5)}`,
  mistake: HOOK + DOT(12, 18.5),
  blunder: `<g transform="translate(-3.8 0)">${HOOK}${DOT(12, 18.5)}</g><g transform="translate(3.8 0)">${HOOK}${DOT(12, 18.5)}</g>`,
};

export function catIconSvg(key) {
  const body = ICONS[key] || '';
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#fff" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
