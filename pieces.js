// Фигуры в стиле Staunton: рисуются SVG прямо в коде, внешние наборы не нужны.
// Белые — светлый бук, чёрные — тёмное дерево (эбонит).

const WHITE = { fill: '#f6efdc', stroke: '#3b2a18', detail: '#3b2a18' };
const BLACK = { fill: '#3a2517', stroke: '#0d0704', detail: '#d2b58a' };

// Подставка и воротник: одинаковые для всех фигур.
const BASE = `
  <path d="M8.5 37 H36.5 V39.5 Q36.5 41 35 41 H10 Q8.5 41 8.5 39.5 Z"/>
  <path d="M10.5 34 H34.5 L36.5 37 H8.5 Z"/>
  <path d="M12 28.5 H33 L34.5 34 H10.5 Z"/>`;

const SHAPES = {
  p: () => `
    <path d="M16 28.5 C16.5 24 18 21.5 19.5 20 H25.5 C27 21.5 28.5 24 29 28.5 Z"/>
    <circle cx="22.5" cy="15.5" r="5"/>`,

  r: () => `
    <path d="M13 3.5 H17 V7 H20 V3.5 H25 V7 H28 V3.5 H32 V11.5 H13 Z"/>
    <path d="M15.5 11.5 H29.5 L28 28.5 H17 Z"/>`,

  n: (d) => `
    <path d="M16 28.5 C14.5 23 15.5 19 18 16 L15.5 12 C17.5 8.5 21 7.5 24 8.5 L28.5 7.5 C32.5 9.5 33.5 14.5 31.5 18 C30.5 21.5 31.5 25.5 30.5 28.5 Z"/>
    <circle cx="25.5" cy="12.5" r="1.3" fill="${d}" stroke="none"/>`,

  b: (d) => `
    <path d="M16.5 28.5 C18 23 19.5 19.5 20.5 17.5 H24.5 C25.5 19.5 27 23 28.5 28.5 Z"/>
    <path d="M20.5 17.5 L21 14 H24 L24.5 17.5 Z"/>
    <circle cx="22.5" cy="10.5" r="3.4"/>
    <path d="M20 12.2 L25 9.2" fill="none" stroke="${d}" stroke-width="1.5"/>`,

  q: () => `
    <circle cx="11" cy="12" r="2.4"/>
    <circle cx="16.5" cy="8.5" r="2.6"/>
    <circle cx="22.5" cy="6.5" r="2.8"/>
    <circle cx="28.5" cy="8.5" r="2.6"/>
    <circle cx="34" cy="12" r="2.4"/>
    <path d="M13 14 L16.5 28.5 H28.5 L32 14 L22.5 21.5 Z"/>
    <path d="M13 14 H32 V16.5 H13 Z"/>`,

  k: () => `
    <path d="M16 28.5 L17.5 18.5 H27.5 L29 28.5 Z"/>
    <path d="M14.5 15 H30.5 L29.5 18.5 H15.5 Z"/>
    <rect x="21" y="2" width="3" height="13" rx="1"/>
    <rect x="18" y="4.5" width="9" height="2.6" rx="1"/>`,
};

export function pieceSvg(type, color) {
  const c = color === 'w' ? WHITE : BLACK;
  const shape = (SHAPES[type] || SHAPES.p)(c.detail);
  return `<svg viewBox="0 0 45 45" aria-hidden="true"><g fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round">${BASE}${shape}</g></svg>`;
}
