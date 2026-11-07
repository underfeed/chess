// Фигуры в стиле Staunton, рисуются SVG прямо в коде.
// Части перекрываются, а контур строится одним слоем под заливкой,
// поэтому внутри фигуры не видно швов и просветов.

const WHITE = { fill: '#f6efdc', stroke: '#3b2a18', detail: '#3b2a18' };
const BLACK = { fill: '#3a2517', stroke: '#0d0704', detail: '#d2b58a' };

// Подставка и воротник: одинаковые для всех фигур. Без ступенек и острых углов.
const BASE = `
  <rect x="9" y="37" width="27" height="4.5" rx="2"/>
  <path d="M11 33 H34 L36 37.5 H9 Z"/>
  <rect x="11" y="28" width="23" height="5.5" rx="2.5"/>`;

const SHAPES = {
  p: () => ({
    body: `<path d="M16 29 C16.5 24.5 18 21.5 19.5 20 H25.5 C27 21.5 28.5 24.5 29 29 Z"/>
      <circle cx="22.5" cy="15.5" r="5"/>`,
    details: '',
  }),

  r: () => ({
    body: `<path d="M13 3.5 H17 V7 H20 V3.5 H25 V7 H28 V3.5 H32 V12 H13 Z" rx="1"/>
      <path d="M15 11 H30 L28.5 29 H16.5 Z"/>`,
    details: '',
  }),

  n: () => ({
    body: `<path d="M16 29 C14.5 23 15.5 19 18 16 L15.5 12 C17.5 8.5 21 7.5 24 8.5 L28.5 7.5 C32.5 9.5 33.5 14.5 31.5 18 C30.5 21.5 31.5 25.5 30.5 29 Z"/>`,
    details: '<circle cx="25.5" cy="12.5" r="1.3"/>',
  }),

  b: () => ({
    body: `<path d="M16.5 29 C18 23.5 19.5 20 20.5 17.5 H24.5 C25.5 20 27 23.5 28.5 29 Z"/>
      <path d="M20.5 17.5 L21 14 H24 L24.5 17.5 Z"/>
      <circle cx="22.5" cy="10.8" r="3.5"/>`,
    details: '<path d="M20.2 12.7 L24.8 9.3" fill="none"/>',
  }),

  q: () => ({
    body: `<circle cx="11" cy="12.5" r="2.4"/>
      <circle cx="16.5" cy="9.5" r="2.6"/>
      <circle cx="22.5" cy="7.5" r="2.8"/>
      <circle cx="28.5" cy="9.5" r="2.6"/>
      <circle cx="34" cy="12.5" r="2.4"/>
      <path d="M11.5 10 H33.5 V14.5 H11.5 Z"/>
      <path d="M13 14 L16.5 29 H28.5 L32 14 L22.5 21.5 Z"/>`,
    details: '',
  }),

  k: () => ({
    body: `<rect x="21" y="2" width="3" height="13" rx="1.2"/>
      <rect x="18" y="4.5" width="9" height="2.6" rx="1.2"/>
      <path d="M14.5 14.5 H30.5 V19 H14.5 Z"/>
      <path d="M16 29 L17.5 18.5 H27.5 L29 29 Z"/>`,
    details: '',
  }),
};

export function pieceSvg(type, color) {
  const c = color === 'w' ? WHITE : BLACK;
  const shape = (SHAPES[type] || SHAPES.p)(c.detail);
  const all = BASE + shape.body;
  // 1) контур: все части одним цветом с обводкой; 2) заливка поверх без обводки;
  // 3) детали (глаз коня, прорезь слона) сверху.
  return `<svg viewBox="0 0 45 45" aria-hidden="true">`
    + `<g fill="${c.stroke}" stroke="${c.stroke}" stroke-width="2.4" stroke-linejoin="round">${all}</g>`
    + `<g fill="${c.fill}" stroke="none">${all}</g>`
    + (shape.details ? `<g fill="${c.detail}" stroke="${c.detail}" stroke-width="1.4" stroke-linecap="round">${shape.details}</g>` : '')
    + `</svg>`;
}
