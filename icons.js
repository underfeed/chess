// Значки категорий ходов. Рисуются SVG, поэтому всегда по центру и без засечек шрифта.
// Все фигуры нарисованы в сетке 24×24, центр = (12, 12).

const DOT = (x, y) => `<circle cx="${x}" cy="${y}" r="1.8" fill="#fff" stroke="none"/>`;
// Аккуратный и ровный вопросительный знак для ошибок/неточностей
const HOOK = '<path d="M9.5 8.8 A2.7 2.7 0 1 1 14.5 11.5 C14.5 13.2 12 13.8 12 15.5"/>';

const ICONS = {
  brilliant: `<path d="M9.5 5.5 V13.5 M14.5 5.5 V13.5"/>${DOT(9.5, 18.5)}${DOT(14.5, 18.5)}`,
  great: `<path d="M12 5.5 V13.5"/>${DOT(12, 18.5)}`,
  best: '<polygon points="12,3.2 14.8,9.2 21.2,9.9 16.4,14.1 17.8,20.5 12,17.1 6.2,20.5 7.6,14.1 2.8,9.9 9.2,9.2" fill="#fff" stroke="none"/>',
  excellent: '<path d="M6.5 12 H17.5 M12 6.5 V17.5"/>',
  good: '<path d="M7 12.5 L10.5 16 L17 8.5"/>',
  book: '<path d="M6.5 7.5 H17.5 M6.5 12 H17.5 M6.5 16.5 H17.5"/>',
  inaccuracy: `<g transform="translate(-1.8 0)">${HOOK}${DOT(12, 18.5)}</g><path d="M17.5 7.5 V13.5"/>${DOT(17.5, 18.5)}`,
  mistake: HOOK + DOT(12, 18.5),
  blunder: `<g transform="translate(-4 0)">${HOOK}${DOT(12, 18.5)}</g><g transform="translate(4 0)">${HOOK}${DOT(12, 18.5)}</g>`,
};

export function catIconSvg(key) {
  const body = ICONS[key] || '';
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
