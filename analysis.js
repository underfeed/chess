// Чистая логика анализа партии. Без DOM и без chess.js, поэтому её можно тестировать в Node.
// Все «оценки» здесь считаются с точки зрения белых в сантипешках (cp), если не сказано иное.

// Пороги потери шанса на победу (в процентных пунктах, шкала 0–100).
// Это ровно Lichess: в lila Advice.scala пороги 0.1 / 0.2 / 0.3 по шкале «шансов» от −1 до +1,
// то есть 5 / 10 / 15 п.п. по шкале 0–100.
// У Chess.com (опубликованные полосы «ожидаемых очков») зевок начинается с 20 п.п.;
// если хотите мягче, поставьте blunder: 20.
// Отличный (до 2 п.п.) и неплохой (до 5 п.п.) — полосы Chess.com, см. classifyMove.
export const THRESHOLDS = { inaccuracy: 5, mistake: 10, blunder: 15 };

// Настройки «особых» категорий. Все числа в процентных пунктах шанса на победу (0–100).
export const SPECIAL = {
  brilliant: {
    maxLossBest: 0, // потеря оценки, если ход совпал с лучшим ходом движка
    maxLossOther: 1, // допустимая потеря, если ход не лучший, но почти равноценный
    minWinAfter: 45, // после жертвы позиция не должна быть проигранной
    maxWinBefore: 80, // в уже выигранной позиции жертва не считается блестящей
    minMateLength: 2, // жертва с матом в 1 — не блестящий ход (если передана длина мата)
  },
  great: {
    minGap: 15, // второй по силе ход хуже лучшего минимум на столько (= уровень зевка)
    minWinBefore: 10, // позиция ещё не безнадёжна…
    maxWinBefore: 85, // …и ещё не выиграна
  },
};

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

const MATE_CP = 9000; // оценки по модулю не меньше этого значения считаются матовыми

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Шанс на победу (0–100) по оценке в сантипешках с точки зрения одной стороны.
// Как у Lichess: оценка обрезается до ±1000 сп, а мат для этой формулы считается как ±1000 сп.
export function winPct(cp) {
  const c = clamp(cp, -1000, 1000);
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

// Точность одного хода (0–100) по падению шанса на победу. Формула Lichess, включая «+1 за неопределённость».
export function moveAccuracy(winBefore, winAfter) {
  const diff = Math.max(0, winBefore - winAfter);
  const a = 103.1668100711649 * Math.exp(-0.04354415386753951 * diff) - 3.166924740191411 + 1;
  return clamp(a, 0, 100);
}

// Точность партии для одной стороны: среднее между (взвешенным) арифметическим и гармоническим.
// weights необязательны: если их нет, все ходы равноценны.
export function gameAccuracy(list, weights) {
  if (!list.length) return null;
  let wsum = 0;
  let asum = 0;
  for (let i = 0; i < list.length; i++) {
    const w = weights && weights[i] != null ? weights[i] : 1;
    wsum += w;
    asum += w * list[i];
  }
  const mean = asum / wsum;
  const harmonic = list.length / list.reduce((s, x) => s + 1 / Math.max(x, 1), 0);
  return (mean + harmonic) / 2;
}

// Вес каждого хода по «нервности» позиции (как у Lichess): чем сильнее прыгает оценка
// вокруг хода, тем важнее этот ход. Ход в спокойной позиции почти не влияет на точность.
// wp — шансы белых на победу по всем позициям (длина n + 1). Возвращает n весов.
// Окно: число ходов / 10, от 2 до 8 (как в lila AccuracyPercent).
export function volatilityWeights(wp) {
  const n = wp.length - 1;
  if (n < 1) return [];
  const size = clamp(Math.floor(n / 10), 2, 8);
  const out = [];
  for (let i = 0; i < n; i++) {
    const start = i < size - 2 ? 0 : i - (size - 2);
    const win = wp.slice(start, start + size);
    const mean = win.reduce((s, x) => s + x, 0) / win.length;
    const sd = Math.sqrt(win.reduce((s, x) => s + (x - mean) ** 2, 0) / win.length);
    out.push(clamp(sd, 0.5, 12));
  }
  return out;
}

// Строка движка {cp?, mate?} (с точки зрения стороны, чей ход) -> оценка белых.
// Мат кодируем большим числом: чем ближе мат, тем оно больше.
export function lineToWhiteCp(line, turn) {
  let v;
  if (line.mate != null) {
    const m = Math.min(Math.abs(line.mate), 99);
    // mate 0 значит, что ходящему уже поставили мат, то есть оценка для него отрицательная.
    v = (line.mate > 0 ? 1 : -1) * (10000 - m * 10);
  } else {
    v = line.cp ?? 0;
  }
  return turn === 'w' ? v : -v;
}

// Красивая запись оценки: 0.30, −1.25, M3, −M2.
export function fmtCp(v) {
  if (v == null || Number.isNaN(v)) return '—';
  if (Math.abs(v) >= MATE_CP) {
    const m = Math.round((10000 - Math.abs(v)) / 10);
    return (v > 0 ? '' : '−') + 'M' + m;
  }
  const s = (Math.abs(v) / 100).toFixed(2);
  return (v < 0 ? '−' : '') + s;
}

// Оценка хода, связанного с матом, по правилам Lichess (MateAdvice в lila).
// prev/next — оценки до и после хода с точки зрения ходившей стороны (мат закодирован как ±(10000 − 10·m)).
// Возвращает 'blunder' | 'mistake' | 'inaccuracy' | null (null — мат не создан и не упущен),
// либо undefined, если мата нет ни до, ни после (тогда судим по шансам на победу).
export function mateVerdict(prev, next) {
  const prevMate = Math.abs(prev) >= MATE_CP;
  const nextMate = Math.abs(next) >= MATE_CP;
  if (!prevMate && !nextMate) return undefined;
  // Мат создан: ходящий выпустил мат против себя.
  if (!prevMate && next <= -MATE_CP) {
    if (prev < -999) return 'inaccuracy'; // и так всё проиграно
    if (prev < -700) return 'mistake';
    return 'blunder';
  }
  // Мат упущен: был мат в пользу ходящего, а теперь его нет (или мат уже против него).
  if (prev >= MATE_CP && (!nextMate || next <= -MATE_CP)) {
    const nextCp = nextMate ? 0 : next;
    if (nextCp > 999) return 'inaccuracy'; // всё равно полностью выигрыш
    if (nextCp > 700) return 'mistake';
    return 'blunder';
  }
  return null;
}

// Подходит ли «форсированный мат» для блестящего хода: либо просто true,
// либо длина мата в ходах (тогда мат в 1 не считается).
function mateQualifies(forcedMate) {
  if (forcedMate === true) return true;
  return typeof forcedMate === 'number' && forcedMate >= SPECIAL.brilliant.minMateLength;
}

// Категория хода.
//  winBefore/winAfter — шанс на победу ходящей стороны до и после хода (0–100);
//  isBest   — сыгран лучший ход движка;
//  isBook   — теоретический ход;
//  gap      — насколько второй по силе ход хуже лучшего (п.п.), либо null;
//  sacrifice — настоящая материальная жертва (считать по линии движка, а не по одному ходу);
//  forcedMate — после хода есть форсированный мат: true или длина мата в ходах;
//  obvious  — ход очевиден: взятие в ответ на взятие, бесплатное взятие фигуры,
//             единственный ответ на шах и т. п. Такие ходы не бывают «замечательными» и «блестящими»;
//  legalMoves — число легальных ходов в позиции (при 1 выбора не было вообще);
//  mateJudgement — результат mateVerdict(): если он не undefined, зевок/ошибка/неточность
//                 определяются по правилам Lichess для матов, а не по шансам на победу.
export function classifyMove({
  winBefore,
  winAfter,
  isBest,
  isBook,
  gap,
  sacrifice,
  forcedMate,
  obvious,
  legalMoves,
  mateJudgement,
}) {
  if (isBook) return 'book';

  // Лучший ход движка не может быть ошибкой: разница оценок до и после — это шум
  // двух независимых поисков, а не качество хода.
  const delta = isBest ? 0 : Math.max(0, winBefore - winAfter);

  if (mateJudgement !== undefined) {
    // Мат создан или упущен: правила Lichess. Лучший ход движка сюда не попадает (delta = 0).
    if (!isBest && mateJudgement) return mateJudgement;
  } else {
    if (delta >= THRESHOLDS.blunder) return 'blunder';
    if (delta >= THRESHOLDS.mistake) return 'mistake';
    if (delta >= THRESHOLDS.inaccuracy) return 'inaccuracy';
  }

  // Очевидные ходы и ходы без выбора не получают особых отметок.
  const trivial = !!obvious || (legalMoves != null && legalMoves <= 1);

  if (!trivial && sacrifice) {
    const B = SPECIAL.brilliant;
    const maxLoss = isBest ? B.maxLossBest : B.maxLossOther;
    // Обычный блестящий ход: жертва, которая почти ничего не стоит по оценке,
    // не оставляет проигранной позицию и сделана не в уже выигранной партии.
    if (delta <= maxLoss && winAfter >= B.minWinAfter && winBefore <= B.maxWinBefore) {
      return 'brilliant';
    }
    // Жертва, ведущая к форсированному мату (лучший ход), — блестящая даже в выигранной позиции.
    if (isBest && mateQualifies(forcedMate)) return 'brilliant';
  }

  // Замечательный: лучший ход, а любой другой был бы зевком. Позиция ещё не решена.
  if (!trivial && isBest && gap != null) {
    const G = SPECIAL.great;
    if (gap >= G.minGap && winBefore >= G.minWinBefore && winBefore <= G.maxWinBefore) {
      return 'great';
    }
  }

  // Полосы Chess.com (в ожидаемых очках): отличный — до 2, неплохой — до 5.
  if (isBest || delta < 0.3) return 'best';
  if (delta <= 2) return 'excellent';
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
//  sacrifice[i], book[i] — булевы флаги для хода i;
//  mates[i]   — (необязательно) форсированный мат после хода i: true или длина мата;
//  obvious[i] — (необязательно) ход очевиден (взятие в ответ, бесплатное взятие…);
//  legalMoves[i] — (необязательно) число легальных ходов в позиции i.
export function buildReview({
  scores,
  second,
  bests,
  playedUcis,
  startTurn,
  sacrifice,
  book,
  mates,
  obvious,
  legalMoves,
}) {
  const n = playedUcis.length;
  const moves = [];
  const acc = { w: [], b: [] };
  const wts = { w: [], b: [] };
  const counts = { w: emptyCounts(), b: emptyCounts() };
  const weights = volatilityWeights(scores.slice(0, n + 1).map((s) => winPct(s)));
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
      forcedMate: mates ? mates[i] : null,
      obvious: !!(obvious && obvious[i]),
      legalMoves: legalMoves ? legalMoves[i] : null,
      mateJudgement: mateVerdict(sign * scores[i], sign * scores[i + 1]),
    });
    // Для точности тоже не штрафуем лучший ход за шум между поисками.
    const a = isBest ? 100 : moveAccuracy(winBefore, winAfter);
    acc[color].push(a);
    wts[color].push(weights[i] ?? 1);
    counts[color][cat] += 1;
    moves.push({
      ply: i + 1,
      color,
      cat,
      winBefore,
      winAfter,
      delta: isBest ? 0 : Math.max(0, winBefore - winAfter),
      acc: a,
    });
  }
  return {
    moves,
    counts,
    accuracy: { w: gameAccuracy(acc.w, wts.w), b: gameAccuracy(acc.b, wts.b) },
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
