// Чистая логика анализа партии. Без DOM и без chess.js, поэтому её можно тестировать в Node.
// Все «оценки» здесь считаются с точки зрения белых в сантипешках (cp), если не сказано иное.

// Пороги потери шанса на победу (в процентных пунктах, шкала 0–100).
// Взяты по мотивам открытой разметки Lichess; при желании подстройте под себя.
export const THRESHOLDS = { inaccuracy: 5, mistake: 10, blunder: 15 };

// Категории ходов. Названия, значки и цвета собственные.
export const CATS = [
  { key: 'brilliant', label: 'Блестящий', sym: '!!', color: '#1fb5a0' },
  { key: 'great', label: 'Замечательный', sym: '!', color: '#4f8fcf' },
  { key: 'best', label: 'Лучший', sym: '★', color: '#7cb342' },
  { key: 'excellent', label: 'Отличный', sym: '+', color: '#9ccc65' },
  { key: 'good', label: 'Неплохой', sym: '✓', color: '#8fa89b' },
  { key: 'book', label: 'Теоретический', sym: '≡', color: '#b98a5b' },
  { key: 'inaccuracy', label: 'Неточность', sym: '?!', color: '#f2c230' },
  { key: 'mistake', label: 'Ошибка', sym: '?', color: '#ef8a2c' },
  { key: 'blunder', label: 'Зевок', sym: '??', color: '#d9403a' },
];

export const CAT_BY_KEY = Object.fromEntries(CATS.map((c) => [c.key, c]));

// Шанс на победу (0–100) по оценке в сантипешках с точки зрения одной стороны.
export function winPct(cp) {
  const c = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

// Точность одного хода (0–100) по падению шанса на победу.
export function moveAccuracy(winBefore, winAfter) {
  const diff = Math.max(0, winBefore - winAfter);
  const a = 103.1668 * Math.exp(-0.04354 * diff) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

// Точность партии для одной стороны: среднее между арифметическим и гармоническим.
export function gameAccuracy(list) {
  if (!list.length) return null;
  const mean = list.reduce((s, x) => s + x, 0) / list.length;
  const harmonic = list.length / list.reduce((s, x) => s + 1 / Math.max(x, 1), 0);
  return (mean + harmonic) / 2;
}

// Строка движка {cp?, mate?} (с точки зрения стороны, чей ход) -> оценка белых.
// Мат кодируем большим числом: чем ближе мат, тем оно больше.
export function lineToWhiteCp(line, turn) {
  let v;
  if (line.mate != null) {
    const m = Math.min(Math.abs(line.mate), 99);
    v = (line.mate >= 0 ? 1 : -1) * (10000 - m * 10);
  } else {
    v = line.cp ?? 0;
  }
  return turn === 'w' ? v : -v;
}

// Красивая запись оценки: 0.30, −1.25, M3, −M2.
export function fmtCp(v) {
  if (v == null || Number.isNaN(v)) return '—';
  if (Math.abs(v) >= 9000) {
    const m = Math.round((10000 - Math.abs(v)) / 10);
    return (v > 0 ? '' : '−') + 'M' + m;
  }
  const s = (Math.abs(v) / 100).toFixed(2);
  return (v < 0 ? '−' : '') + s;
}

// Категория хода.
// winBefore/winAfter — шанс на победу ходящей стороны до и после хода.
// gap — насколько второй по силе ход хуже лучшего (в п.п.), либо null.
export function classifyMove({ winBefore, winAfter, isBest, isBook, gap, sacrifice, forcedMate }) {
  if (isBook) return 'book';
  const delta = Math.max(0, winBefore - winAfter);
  if (delta >= THRESHOLDS.blunder) return 'blunder';
  if (delta >= THRESHOLDS.mistake) return 'mistake';
  if (delta >= THRESHOLDS.inaccuracy) return 'inaccuracy';
  if (sacrifice && delta < 2 && winAfter >= 40 && winBefore <= 85) return 'brilliant';
  // Жертва, ведущая к форсированному мату (лучший ход движка), — блестящий ход даже в выигранной позиции.
  if (sacrifice && forcedMate && isBest) return 'brilliant';
  // Замечательный: единственный сильный ход (второй заметно хуже) или спасающий/переломный ход.
  if (gap != null && delta < 2 && winBefore > 5 && winBefore < 95) {
    if (gap >= 6) return 'great';
  }
  if (isBest || delta < 0.3) return 'best';
  if (delta < 2) return 'excellent';
  return 'good';
}

function emptyCounts() {
  const o = {};
  for (const c of CATS) o[c.key] = 0;
  return o;
}

// Собирает итог разбора партии.
//  scores[i]  — оценка белых в позиции i (0..n), включая позицию после последнего хода;
//  second[i]  — оценка белых по второй линии движка в позиции i или null;
//  bests[i]   — лучший ход движка (uci) в позиции i;
//  playedUcis — сыгранные ходы (uci);
//  startTurn  — 'w' или 'b' в начальной позиции;
//  sacrifice[i], book[i] — булевы флаги для хода i.
export function buildReview({ scores, second, bests, playedUcis, startTurn, sacrifice, book, mates }) {
  const n = playedUcis.length;
  const moves = [];
  const acc = { w: [], b: [] };
  const counts = { w: emptyCounts(), b: emptyCounts() };
  for (let i = 0; i < n; i++) {
    const color = (startTurn === 'w') === (i % 2 === 0) ? 'w' : 'b';
    const sign = color === 'w' ? 1 : -1;
    const winBefore = winPct(sign * scores[i]);
    const winAfter = winPct(sign * scores[i + 1]);
    const gap = second && second[i] != null ? winBefore - winPct(sign * second[i]) : null;
    const isBest = bests[i] != null && bests[i] === playedUcis[i];
    const cat = classifyMove({
      winBefore,
      winAfter,
      isBest,
      isBook: !!(book && book[i]),
      gap,
      sacrifice: !!(sacrifice && sacrifice[i]),
      forcedMate: !!(mates && mates[i]),
    });
    const a = moveAccuracy(winBefore, winAfter);
    acc[color].push(a);
    counts[color][cat] += 1;
    moves.push({ ply: i + 1, color, cat, winBefore, winAfter, delta: Math.max(0, winBefore - winAfter), acc: a });
  }
  return {
    moves,
    counts,
    accuracy: { w: gameAccuracy(acc.w), b: gameAccuracy(acc.b) },
    scores,
    bests,
  };
}

// Разбор строки `info ...` от движка. Возвращает null, если в ней нет оценки и линии.
export function parseInfo(line) {
  if (!line.startsWith('info') || !line.includes(' pv ')) return null;
  const t = line.trim().split(/\s+/);
  let depth = 0;
  let multipv = 1;
  let cp = null;
  let mate = null;
  let bound = false;
  let pv = [];
  for (let i = 1; i < t.length; i++) {
    const w = t[i];
    if (w === 'depth') depth = +t[++i];
    else if (w === 'multipv') multipv = +t[++i];
    else if (w === 'score') {
      const kind = t[++i];
      const val = +t[++i];
      if (kind === 'cp') cp = val;
      else if (kind === 'mate') mate = val;
    } else if (w === 'lowerbound' || w === 'upperbound') bound = true;
    else if (w === 'pv') {
      pv = t.slice(i + 1);
      break;
    }
  }
  if (cp == null && mate == null) return null;
  return { depth, multipv, cp, mate, bound, pv };
}

// Дебютная книга из TSV-файлов lichess-org/chess-openings (колонки: eco, name, pgn).
// Ход считается теоретическим, если последовательность ходов партии до него есть в книге.
// Перестановки ходов не учитываются.
export function buildBook(tsvTexts) {
  const prefixes = new Set();
  const names = new Map();
  for (const text of tsvTexts) {
    const rows = text.split('\n').slice(1);
    for (const raw of rows) {
      const row = raw.trim();
      if (!row) continue;
      const [eco, name, pgn] = row.split('\t');
      if (!pgn) continue;
      const sans = pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/);
      for (let k = 1; k <= sans.length; k++) prefixes.add(sans.slice(0, k).join(' '));
      names.set(sans.join(' '), `${eco} ${name}`);
    }
  }
  return { prefixes, names };
}

// Собирает FEN по расстановке из редактора. board: Map «клетка» -> {type, color}.
// Право на рокировку сохраняется, только если король и ладья стоят на своих местах.
export function boardToFen(board, turn, castle) {
  const files = 'abcdefgh';
  const rows = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = board.get(files[f] + rank);
      if (!p) { empty += 1; continue; }
      if (empty) { row += empty; empty = 0; }
      row += p.color === 'w' ? p.type.toUpperCase() : p.type;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const at = (sq, type, color) => {
    const p = board.get(sq);
    return !!p && p.type === type && p.color === color;
  };
  let cs = '';
  if (castle.K && at('e1', 'k', 'w') && at('h1', 'r', 'w')) cs += 'K';
  if (castle.Q && at('e1', 'k', 'w') && at('a1', 'r', 'w')) cs += 'Q';
  if (castle.k && at('e8', 'k', 'b') && at('h8', 'r', 'b')) cs += 'k';
  if (castle.q && at('e8', 'k', 'b') && at('a8', 'r', 'b')) cs += 'q';
  return `${rows.join('/')} ${turn} ${cs || '-'} - 0 1`;
}

// Простые проверки расстановки. Возвращает текст ошибки или null.
export function boardProblem(board) {
  let wk = 0;
  let bk = 0;
  for (const [sq, p] of board) {
    if (p.type === 'k') { if (p.color === 'w') wk += 1; else bk += 1; }
    if (p.type === 'p' && (sq[1] === '1' || sq[1] === '8')) {
      return 'Пешки не могут стоять на первой и последней горизонталях';
    }
  }
  if (wk !== 1 || bk !== 1) return 'На доске должно быть ровно по одному королю каждого цвета';
  return null;
}

export function openingName(book, sans) {
  if (!book) return null;
  for (let k = sans.length; k >= 1; k--) {
    const nm = book.names.get(sans.slice(0, k).join(' '));
    if (nm) return nm;
  }
  return null;
}
