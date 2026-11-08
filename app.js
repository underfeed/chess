import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1/+esm';
import {
  CATS, CAT_BY_KEY, winPct, lineToWhiteCp, fmtCp, buildReview, buildBook, openingName,
  boardToFen, boardProblem, gameAccuracy,
} from './analysis.js';
import { Engine } from './engine.js';
import { pieceSvg } from './pieces.js';
import { catIconSvg } from './icons.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const VARIANT_TEXT = '︎'; // принудительно текстовое начертание, а не эмодзи
const FILES = 'abcdefgh';
const $ = (id) => document.getElementById(id);

const tg = window.Telegram && window.Telegram.WebApp;
try {
  if (tg) {
    tg.ready();
    tg.expand();
    if (tg.setHeaderColor) tg.setHeaderColor('#262522');
    if (tg.setBackgroundColor) tg.setBackgroundColor('#262522');
  }
} catch (e) { /* вне Telegram приложение тоже работает */ }

/* ---------- Настройки ---------- */
const DEFAULTS = { depth: 14, sound: true, live: true };
const settings = (() => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('chess-settings') || '{}') }; } catch (e) { return { ...DEFAULTS }; }
})();
function saveSettings() {
  try { localStorage.setItem('chess-settings', JSON.stringify(settings)); } catch (e) { /* ничего страшного */ }
}

/* ---------- Состояние ---------- */
const G = { startFen: START_FEN, fens: [START_FEN], sans: [], ucis: [], ply: 0, headers: {}, flipped: false };
let review = null;
let live = { lines: [], depth: 0 };
let selected = null;
let targets = [];
let book = null;
let engineState = 'loading'; // loading | ready | error
let reviewToken = 0;
let liveTimer = null;
let editor = null; // состояние редактора позиции, null когда он закрыт
let drag = null; // перетаскивание фигуры: {sq, from, piece, moved, x0, y0}
const EVAL = new Map(); // fen -> {lines, multi}: результат движка по каждой позиции
let loopBusy = false;  // идёт ли фоновый анализ
let loopAgain = false; // позиция сменилась, нужно начать заново
let sacMemo = { key: '', sac: [], book: [] };
const engine = new Engine();

const cur = () => new Chess(G.fens[G.ply]);
const turnOf = (fen) => fen.split(' ')[1];

/* ---------- Мелочи: тост, звук, вибрация ---------- */
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2800);
}

let actx = null;
function beep(freq) {
  if (!settings.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    g.gain.value = 0.09;
    o.connect(g);
    g.connect(actx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.07);
    o.stop(actx.currentTime + 0.09);
  } catch (e) { /* звук недоступен */ }
}
// Звук хода: как будто фигуру ставят на деревянную доску.
// Складывается из трёх частей: короткий щелчок контакта, затухающие тона дерева
// и глухой отзвук самой доски. Тон слегка меняется от хода к ходу, как у живой фигуры.
let noiseBuf = null;
// Короткий сухой деревянный стук: острый контакт + быстро гаснущие тоны, без хвоста.
const WOOD_MODES = [ // [частота Гц, громкость, затухание с]
  [190, 0.9, 0.014],
  [380, 0.5, 0.01],
  [640, 0.18, 0.006],
];

function knock(t, strength, pitch) {
  const sr = actx.sampleRate;
  if (!noiseBuf) {
    noiseBuf = actx.createBuffer(1, Math.floor(sr * 0.02), sr);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.004));
  }
  const master = actx.createGain();
  master.gain.value = strength * 0.5;
  const lp = actx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1100;
  lp.Q.value = 0.4;
  const sh = actx.createWaveShaper(); // лёгкая жёсткость
  const cv = new Float32Array(256);
  for (let i = 0; i < 256; i++) cv[i] = Math.tanh(((i / 128) - 1) * 2.5);
  sh.curve = cv;
  master.connect(sh);
  sh.connect(lp);
  lp.connect(actx.destination);

  // 1) контакт: очень короткий приглушённый щелчок
  const src = actx.createBufferSource();
  src.buffer = noiseBuf;
  const bp = actx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 450;
  bp.Q.value = 0.5;
  const cg = actx.createGain();
  cg.gain.value = 0.45;
  src.connect(bp);
  bp.connect(cg);
  cg.connect(master);
  src.start(t);

  // 2) дерево: гладкие тоны с очень быстрым затуханием
  for (const [f, a, tau] of WOOD_MODES) {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = 'sine';
    o.frequency.value = f * pitch;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(a, t + 0.0008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + tau * 5);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + tau * 5 + 0.01);
  }

  // 3) корпус доски: короткий низкий тон
  const o2 = actx.createOscillator();
  const g2 = actx.createGain();
  o2.type = 'sine';
  o2.frequency.setValueAtTime(120 * pitch, t);
  o2.frequency.exponentialRampToValueAtTime(75 * pitch, t + 0.04);
  g2.gain.setValueAtTime(1.0, t);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
  o2.connect(g2);
  g2.connect(master);
  o2.start(t);
  o2.stop(t + 0.06);
}

function woodClack(capture) {
  if (!settings.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    knock(actx.currentTime + 0.005, capture ? 1 : 0.8, capture ? 0.9 : 1);
  } catch (e) { /* звук недоступен */ }
}
const playMoveSound = (capture) => woodClack(capture);

// Ставит «призрак» фигуры точно под курсор, без задержки.
function placeGhost(x, y, half) {
  $('ghost').style.transform = `translate3d(${x - half}px, ${y - half}px, 0)`;
}

// Быстро доводит фигуру до клетки назначения и вызывает done.
function glideGhost(sq, done) {
  const ghost = $('ghost');
  const r = $('board').getBoundingClientRect();
  const size = r.width / 8;
  const f = FILES.indexOf(sq[0]);
  const rk = parseInt(sq[1], 10) - 1;
  const col = G.flipped ? 7 - f : f;
  const row = G.flipped ? rk : 7 - rk;
  const x = r.left + col * size + (size - ghost.offsetWidth) / 2;
  const y = r.top + row * size + (size - ghost.offsetHeight) / 2;
  ghost.style.transition = 'transform 0.07s ease-out';
  ghost.style.transform = `translate(${x}px, ${y}px)`;
  setTimeout(done, 70);
}
function haptic() {
  try { if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light'); } catch (e) { /* нет */ }
}

/* ---------- Вспомогательные шахматные функции ---------- */
function terminalScore(fen) {
  const c = new Chess(fen);
  if (c.isCheckmate()) return c.turn() === 'w' ? -10000 : 10000;
  if (c.isGameOver()) return 0;
  return null;
}

function findKing(c, color) {
  for (const row of c.board()) {
    for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  }
  return null;
}

function uciToSan(fen, uci) {
  try {
    const m = new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return m ? m.san : null;
  } catch (e) { return null; }
}

function pvToSan(fen, pv, max = 6) {
  const c = new Chess(fen);
  const out = [];
  let moveNo = parseInt(fen.split(' ')[5], 10) || 1;
  for (const u of pv.slice(0, max)) {
    let m;
    try { m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch (e) { break; }
    if (!m) break;
    if (m.color === 'w') out.push(`${moveNo}. ${m.san}`);
    else { out.push((out.length === 0 ? `${moveNo}… ` : '') + m.san); moveNo += 1; }
  }
  return out.join(' ');
}

const PIECE_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// Эвристика «жертвы»: ходящая фигура (не пешка и не король) встаёт под бой так,
// что при размене теряет по материалу не меньше двух пунктов.
function detectSacrifice(fen, uci) {
  try {
    const c = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const piece = c.get(from);
    if (!piece || piece.type === 'p' || piece.type === 'k') return false;
    const captured = c.get(to);
    const gain = captured ? PIECE_VAL[captured.type] : 0;
    const mover = piece.color;
    const enemy = mover === 'w' ? 'b' : 'w';
    c.move({ from, to, promotion: uci[4] });
    const defended = c.isAttacked(to, mover);
    let cheapest = Infinity;
    if (typeof c.attackers === 'function') {
      for (const sq of c.attackers(to, enemy)) {
        const p = c.get(sq);
        if (!p) continue;
        if (p.type === 'k') { if (!defended) cheapest = Math.min(cheapest, 0); } else cheapest = Math.min(cheapest, PIECE_VAL[p.type]);
      }
    } else if (c.isAttacked(to, enemy)) {
      cheapest = 1;
    }
    if (!Number.isFinite(cheapest)) return false;
    const net = gain + (defended ? cheapest : 0) - PIECE_VAL[piece.type];
    return net <= -2;
  } catch (e) { return false; }
}

// Жертва по линии движка: после хода и ~4 полуходов лучшей игры материал ходящего
// остаётся ниже, чем был до хода, не меньше чем на 2 пункта (пешка не считается жертвой).
function materialOf(c, color) {
  let m = 0;
  for (const row of c.board()) for (const p of row) if (p && p.color === color) m += PIECE_VAL[p.type];
  return m;
}

function detectSacrificePv(fen, uci, pv) {
  try {
    if (!pv || !pv.length) return false;
    const c = new Chess(fen);
    const mover = c.turn();
    const enemy = mover === 'w' ? 'b' : 'w';
    const before = materialOf(c, mover) - materialOf(c, enemy);
    if (!c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })) return false;
    let worst = 0;
    let k = 0;
    for (const u of pv.slice(0, 4)) {
      if (!c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })) break;
      k += 1;
      if (k % 2 === 0) worst = Math.min(worst, materialOf(c, mover) - materialOf(c, enemy) - before);
    }
    return worst <= -2;
  } catch (e) { return false; }
}

/* ---------- Доска ---------- */
function sqCenter(sq) {
  const file = FILES.indexOf(sq[0]);
  const rank = parseInt(sq[1], 10) - 1;
  return [(G.flipped ? 7 - file : file) + 0.5, (G.flipped ? rank : 7 - rank) + 0.5];
}

function renderBoard() {
  const c = cur();
  const boardEl = $('board');
  boardEl.innerHTML = '';
  const lastUci = !editor && G.ply > 0 ? G.ucis[G.ply - 1] : null;
  const last = lastUci ? { from: lastUci.slice(0, 2), to: lastUci.slice(2, 4) } : null;
  const kingInCheck = !editor && c.inCheck() ? findKing(c, c.turn()) : null;
  const rv = !editor && review && G.ply > 0 ? review.moves[G.ply - 1] : null;

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const file = G.flipped ? 7 - f : f;
      const rank = G.flipped ? r : 7 - r;
      const sq = FILES[file] + (rank + 1);
      const div = document.createElement('div');
      div.className = 'sq ' + ((file + rank) % 2 === 0 ? 'dark' : 'light');
      div.dataset.sq = sq;
      if (last && (sq === last.from || sq === last.to)) div.classList.add('last');
      if (sq === selected) div.classList.add('sel');
      if (sq === kingInCheck) div.classList.add('check');
      const p = editor ? editor.board.get(sq) : c.get(sq);
      if (p && !(drag && drag.moved && sq === drag.from)) {
        const s = document.createElement('span');
        s.className = 'piece ' + p.color;
        s.innerHTML = pieceSvg(p.type, p.color);
        div.appendChild(s);
      }
      if (targets.includes(sq)) {
        const d = document.createElement('i');
        d.className = p ? 'cap' : 'dot';
        div.appendChild(d);
      }
      if (f === 0) {
        const n = document.createElement('b');
        n.className = 'rk';
        n.textContent = String(rank + 1);
        div.appendChild(n);
      }
      if (r === 7) {
        const n = document.createElement('b');
        n.className = 'fl';
        n.textContent = FILES[file];
        div.appendChild(n);
      }
      if (last && sq === last.to) {
        const bdg = document.createElement('span');
        bdg.className = 'sqbadge';
        if (rv) {
          const cat = CAT_BY_KEY[rv.cat];
          bdg.style.background = cat.color;
          bdg.innerHTML = catIconSvg(cat.key);
        } else {
          bdg.style.background = '#6b6862';
          bdg.textContent = '…';
        }
        div.appendChild(bdg);
      }
      boardEl.appendChild(div);
    }
  }
  renderArrow();
}

function renderArrow() {
  const svg = $('arrows');
  svg.innerHTML = '';
  const uci = !editor && settings.live && live.lines[0] && live.lines[0].pv && live.lines[0].pv[0];
  if (!uci) return;
  const [x1, y1] = sqCenter(uci.slice(0, 2));
  const [x2, y2] = sqCenter(uci.slice(2, 4));
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (!len) return;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  // Форма стрелки: острие в точке x2,y2, хвост уходит назад к x1,y1.
  // Контур задан в локальных координатах (back — вдоль стрелки назад, lat — поперёк), симметричен.
  const contour = [
    [0, 0], [0.15, 0.29], [0.16, 0.115], [len, 0], [0.16, -0.115], [0.15, -0.29],
  ];
  const pts = contour.map(([back, lat]) => [
    x2 - ux * back + px * lat,
    y2 - uy * back + py * lat,
  ].join(',')).join(' ');
  svg.innerHTML = `<polygon points="${pts}" fill="rgba(124,179,66,0.5)"></polygon>`;
}

function onSquare(sq) {
  if (editor) { editorClick(sq); return; }
  const c = cur();
  if (selected && targets.includes(sq)) { tryMove(selected, sq); return; }
  const p = c.get(sq);
  if (p && p.color === c.turn() && !c.isGameOver()) {
    selected = sq;
    targets = c.moves({ square: sq, verbose: true }).map((m) => m.to);
  } else {
    selected = null;
    targets = [];
  }
  renderBoard();
}

let promoResolve = null;
function askPromotion(color) {
  return new Promise((resolve) => {
    promoResolve = resolve;
    const box = $('promo-box');
    box.innerHTML = '';
    for (const t of ['q', 'r', 'b', 'n']) {
      const b = document.createElement('button');
      b.innerHTML = pieceSvg(t, color);
      b.style.background = '#cbbf9f';
      b.style.color = color === 'w' ? '#fffdf6' : '#1e1c1a';
      b.style.textShadow = color === 'w' ? '0 0 2px #000, 0 0 2px #000' : 'none';
      b.onclick = () => { $('promo').classList.remove('on'); promoResolve = null; resolve(t); };
      box.appendChild(b);
    }
    $('promo').classList.add('on');
  });
}
$('promo').addEventListener('click', (e) => {
  if (e.target.id === 'promo') {
    $('promo').classList.remove('on');
    if (promoResolve) { promoResolve(null); promoResolve = null; }
  }
});

async function tryMove(from, to) {
  const c = cur();
  const cands = c.moves({ square: from, verbose: true }).filter((m) => m.to === to);
  if (!cands.length) return;
  let promo;
  if (cands[0].promotion) {
    promo = await askPromotion(c.turn());
    if (!promo) { selected = null; targets = []; renderBoard(); return; }
  }
  makeMove(from, to, promo);
}

function makeMove(from, to, promotion) {
  const c = cur();
  let m;
  try { m = c.move({ from, to, promotion }); } catch (e) { return; }
  if (!m) return;
  const uci = from + to + (m.promotion || '');
  if (!(G.sans[G.ply] === m.san && G.ucis[G.ply] === uci)) {
    G.sans.length = G.ply;
    G.ucis.length = G.ply;
    G.fens.length = G.ply + 1;
    G.sans.push(m.san);
    G.ucis.push(uci);
    G.fens.push(c.fen());
  }
  playMoveSound(!!m.captured);
  haptic();
  G.ply += 1;
  selected = null;
  targets = [];
  renderAll();
  requestLive();
}

function goTo(ply) {
  if (editor) return;
  const target = Math.max(0, Math.min(G.sans.length, ply));
  const prev = G.ply;
  G.ply = target;
  selected = null;
  targets = [];
  if (Math.abs(target - prev) === 1) playMoveSound(G.sans[Math.max(target, prev) - 1].includes('x'));
  renderAll();
  requestLive();
}

/* ---------- Редактор позиции ---------- */
const ED_TYPES = ['k', 'q', 'r', 'b', 'n', 'p'];

function buildPalette() {
  const box = $('palette');
  box.innerHTML = '';
  for (const color of ['w', 'b']) {
    for (const type of ED_TYPES) {
      const b = document.createElement('button');
      b.className = `pbtn ${color}`;
      b.dataset.tool = color + type;
      b.innerHTML = pieceSvg(type, color);
      b.onclick = () => { if (editor) { editor.tool = editor.tool === b.dataset.tool ? null : b.dataset.tool; renderPalette(); } };
      box.appendChild(b);
    }
  }
  const er = document.createElement('button');
  er.className = 'pbtn erase';
  er.dataset.tool = 'erase';
  er.textContent = 'Ластик (убрать фигуру)';
  er.onclick = () => { if (editor) { editor.tool = editor.tool === 'erase' ? null : 'erase'; renderPalette(); } };
  box.appendChild(er);
}

function renderPalette() {
  document.querySelectorAll('#palette .pbtn').forEach((b) => b.classList.toggle('on', !!editor && editor.tool === b.dataset.tool));
}

function syncEditorUi() {
  if (!editor) return;
  $('turn-w').classList.toggle('on', editor.turn === 'w');
  $('turn-b').classList.toggle('on', editor.turn === 'b');
  for (const k of ['K', 'Q', 'k', 'q']) $('castle-' + k).checked = !!editor.castle[k];
  renderPalette();
}

function openEditor() {
  reviewToken += 1; // останавливаем разбор партии, если он шёл
  clearTimeout(liveTimer);
  engine.stop();
  live = { lines: [], depth: 0 };
  const c = cur();
  const board = new Map();
  for (const row of c.board()) for (const p of row) if (p) board.set(p.square, { type: p.type, color: p.color });
  const parts = G.fens[G.ply].split(' ');
  const rights = parts[2] || '-';
  editor = {
    board,
    tool: null,
    turn: parts[1] === 'b' ? 'b' : 'w',
    castle: { K: rights.includes('K'), Q: rights.includes('Q'), k: rights.includes('k'), q: rights.includes('q') },
  };
  selected = null;
  targets = [];
  $('editor').style.display = '';
  $('btn-editor').textContent = 'Закрыть редактор';
  syncEditorUi();
  renderAll();
}

function hideEditor() {
  editor = null;
  $('editor').style.display = 'none';
  $('btn-editor').textContent = 'Редактор';
}

function closeEditor() {
  hideEditor();
  renderAll();
  requestLive();
}

function editorClick(sq) {
  const t = editor.tool;
  if (!t) { toast('Выберите фигуру в палитре над доской'); return; }
  if (t === 'erase') {
    editor.board.delete(sq);
  } else {
    const piece = { color: t[0], type: t[1] };
    const old = editor.board.get(sq);
    if (old && old.color === piece.color && old.type === piece.type) editor.board.delete(sq);
    else editor.board.set(sq, piece);
  }
  haptic();
  renderBoard();
}

function editorDone() {
  const problem = boardProblem(editor.board);
  if (problem) { toast(problem); return; }
  const fen = boardToFen(editor.board, editor.turn, editor.castle);
  try {
    new Chess(fen);
    // Король стороны, которая не ходит, не может стоять под шахом.
    const p = fen.split(' ');
    p[1] = p[1] === 'w' ? 'b' : 'w';
    if (new Chess(p.join(' ')).inCheck()) {
      toast('Невозможная позиция: король стороны, которая не ходит, под шахом');
      return;
    }
  } catch (e) {
    toast('Позиция некорректна: ' + (e.message || e));
    return;
  }
  loadFen(fen);
  toast('Позиция установлена');
}

/* ---------- Живой анализ ---------- */
function isTerminal(fen) { return new Chess(fen).isGameOver(); }

const zeroCounts = () => Object.fromEntries(CATS.map((c) => [c.key, 0]));

function positionWhiteCp(i) {
  const fen = G.fens[i];
  const t = terminalScore(fen);
  if (t !== null) return t;
  const c = EVAL.get(fen);
  return c ? lineToWhiteCp(c.lines[0], turnOf(fen)) : null;
}

function gameFlags() {
  const key = G.startFen + '|' + G.ucis.join(',') + '|' + (book ? 1 : 0);
  if (sacMemo.key !== key) {
    const sac = G.ucis.map((u, i) => detectSacrifice(G.fens[i], u));
    const bk = G.ucis.map((u, i) => !!(book && G.startFen === START_FEN && book.prefixes.has(G.sans.slice(0, i + 1).join(' '))));
    sacMemo = { key, sac, book: bk };
  }
  return sacMemo;
}

// Категория одного хода j (из позиции j в позицию j+1), если обе позиции уже разобраны.
function moveInfo(j) {
  if (j < 0 || j + 1 >= G.fens.length) return null;
  const f0 = G.fens[j];
  const s0 = positionWhiteCp(j);
  const s1 = positionWhiteCp(j + 1);
  if (s0 == null || s1 == null) return null;
  const turn = turnOf(f0);
  const c0 = EVAL.get(f0);
  const isTerm = terminalScore(f0) !== null;
  const second = c0 && c0.lines[1] && !isTerm ? [lineToWhiteCp(c0.lines[1], turn)] : [null];
  const bests = [c0 && !isTerm && c0.lines[0].pv[0] ? c0.lines[0].pv[0] : null];
  const f = gameFlags();
  const r = buildReview({
    scores: [s0, s1], second, bests, playedUcis: [G.ucis[j]], startTurn: turn,
    sacrifice: [f.sac[j] || detectSacrificePv(f0, G.ucis[j], (EVAL.get(G.fens[j + 1]) || { lines: [] }).lines[0] && EVAL.get(G.fens[j + 1]).lines[0].pv)], book: [f.book[j]],
  });
  return r.moves[0];
}

// Сводка по партии: то, что уже разобрано, остальное null (показывается как «считаю»).
function buildLiveReview() {
  const n = G.fens.length;
  const scores = [];
  const bests = [];
  for (let i = 0; i < n; i++) {
    scores.push(positionWhiteCp(i));
    const c = EVAL.get(G.fens[i]);
    bests.push(c && c.lines[0] && c.lines[0].pv[0] ? c.lines[0].pv[0] : null);
  }
  const moves = [];
  const acc = { w: [], b: [] };
  const counts = { w: zeroCounts(), b: zeroCounts() };
  for (let j = 0; j < G.ucis.length; j++) {
    const m = moveInfo(j);
    moves.push(m);
    if (m) { acc[m.color].push(m.acc); counts[m.color][m.cat] += 1; }
  }
  return { moves, counts, accuracy: { w: gameAccuracy(acc.w), b: gameAccuracy(acc.b) }, scores, bests };
}

// Перезапуск фонового анализа при любом изменении позиции.
function requestAnalysis() {
  const c = EVAL.get(G.fens[G.ply]);
  live = c ? { lines: c.lines, depth: settings.depth } : { lines: [], depth: 0 };
  review = buildLiveReview();
  renderAll();
  setProgress();
  if (loopBusy) {
    loopAgain = true;
    engine.stop();
  } else {
    runAnalysis();
  }
}

function runAnalysis() {
  loopBusy = true;
  (async () => {
    try {
      do {
        loopAgain = false;
        await analysisPass();
      } while (loopAgain);
    } catch (e) {
      /* движок недоступен — просто останавливаем фон */
    } finally {
      loopBusy = false;
    }
  })();
}

// Разбирает позиции партии: сначала текущую, затем предыдущую, затем с конца.
async function analysisPass() {
  if (engineState !== 'ready' || editor) return;
  const n = G.fens.length;
  const order = [G.ply, G.ply - 1];
  for (let i = n - 1; i >= 0; i--) order.push(i);
  const seen = new Set();
  for (const i of order) {
    if (i < 0 || i >= n || seen.has(i)) continue;
    seen.add(i);
    if (loopAgain || editor) return;
    const fen = G.fens[i];
    if (terminalScore(fen) !== null) continue;
    const isCur = i === G.ply;
    const need = isCur ? 3 : 2;
    const have = EVAL.get(fen);
    if (have && have.multi >= need) continue;
    const lines = await engine.analyze(fen, {
      depth: settings.depth,
      multipv: need,
      onInfo: isCur ? (ls, d) => {
        if (fen === G.fens[G.ply]) { live = { lines: ls, depth: d }; scheduleEvalRender(); }
      } : null,
    });
    if (!lines || !lines.length) return;
    EVAL.set(fen, { lines, multi: need });
    if (isCur) live = { lines, depth: lines[0].depth };
    onAnalysisUpdate();
  }
}

function onAnalysisUpdate() {
  review = buildLiveReview();
  renderBoard();
  renderArrow();
  renderEval();
  renderMoves();
  renderGraph();
  renderPanel();
  renderComments();
  setProgress();
}

function requestLive() { requestAnalysis(); }

let evalRaf = 0;
function scheduleEvalRender() {
  if (evalRaf) return;
  evalRaf = requestAnimationFrame(() => { evalRaf = 0; renderEval(); renderArrow(); });
}

function currentWhiteCp() {
  if (editor) return null;
  const fen = G.fens[G.ply];
  const t = terminalScore(fen);
  if (t !== null) return t;
  if (settings.live && live.lines[0]) return lineToWhiteCp(live.lines[0], turnOf(fen));
  if (review && review.scores[G.ply] != null) return review.scores[G.ply];
  return null;
}

function renderEval() {
  const fen = G.fens[G.ply];
  const v = currentWhiteCp();
  const mated = !editor && new Chess(fen).isCheckmate();
  $('evalnum').textContent = mated ? 'Мат' : fmtCp(v);
  $('evalfill').style.height = (v == null ? 50 : winPct(v)).toFixed(1) + '%';
  $('evalbar').classList.toggle('flip', G.flipped);
  $('depthval').textContent = String(settings.depth);
  $('live-toggle').classList.toggle('on', settings.live);
  $('enginename').textContent = engineState === 'ready' ? engine.name
    : engineState === 'loading' ? 'Загружаю движок…' : 'Движок недоступен';

  const box = $('lines');
  box.innerHTML = '';
  const note = (text) => { const s = document.createElement('span'); s.className = 'muted'; s.textContent = text; box.appendChild(s); };
  if (editor) { note('Редактор позиции открыт: расставьте фигуры и нажмите «Готово».'); return; }
  if (engineState === 'error') { note('Файлы движка не найдены. Запустите fetch_engine.sh (см. README). Доска и импорт партий работают и без него.'); return; }
  if (!settings.live) { note('Анализ в реальном времени выключен.'); return; }
  if (!live.lines.length) { note(engineState === 'ready' ? (isTerminal(fen) ? 'Партия окончена.' : 'Думаю…') : 'Движок загружается…'); return; }
  const turn = turnOf(fen);
  for (const l of live.lines) {
    const row = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = fmtCp(lineToWhiteCp(l, turn));
    row.appendChild(b);
    row.appendChild(document.createTextNode(' ' + pvToSan(fen, l.pv)));
    box.appendChild(row);
  }
}

/* ---------- Панель точности и категорий ---------- */
function buildCats() {
  const box = $('cats');
  box.innerHTML = '';
  for (const c of CATS) {
    const row = document.createElement('div');
    row.className = 'catrow';
    const w = document.createElement('button');
    w.className = 'cnt zero';
    w.id = `cnt-w-${c.key}`;
    w.style.color = c.color;
    w.textContent = '0';
    w.onclick = () => jumpToCat(c.key, 'w');
    const name = document.createElement('div');
    name.className = 'catname';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.style.background = c.color;
    badge.innerHTML = catIconSvg(c.key);
    name.appendChild(badge);
    name.appendChild(document.createTextNode(c.label));
    const b = document.createElement('button');
    b.className = 'cnt zero';
    b.id = `cnt-b-${c.key}`;
    b.style.color = c.color;
    b.textContent = '0';
    b.onclick = () => jumpToCat(c.key, 'b');
    row.append(w, name, b);
    box.appendChild(row);
  }
}

function renderPanel() {
  const fmt = (x) => (x == null ? '–' : Math.round(x) + '%');
  $('acc-w').textContent = review ? fmt(review.accuracy.w) : '0%';
  $('acc-b').textContent = review ? fmt(review.accuracy.b) : '0%';
  for (const c of CATS) {
    for (const side of ['w', 'b']) {
      const el = $(`cnt-${side}-${c.key}`);
      const n = review ? review.counts[side][c.key] : 0;
      el.textContent = String(n);
      el.classList.toggle('zero', n === 0);
    }
  }
}

function jumpToCat(key, side) {
  if (!review) { toast('Анализ ещё не готов'); return; }
  const plies = review.moves
    .map((m, i) => (m && m.cat === key && m.color === side ? i + 1 : 0))
    .filter(Boolean);
  if (!plies.length) return;
  const next = plies.find((p) => p > G.ply) || plies[0];
  goTo(next);
}

/* ---------- Список ходов, комментарии, график ---------- */
// Прокручивает только внутри своего списка, страницу не трогает.
function keepInView(box, el) {
  if (!el || box.style.display === 'none') return;
  box.scrollTop = Math.max(0, el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2);
}

function plyNumber(i) {
  const startNo = parseInt(G.fens[0].split(' ')[5], 10) || 1;
  const startBlack = turnOf(G.fens[0]) === 'b';
  return startNo + Math.floor((i + (startBlack ? 1 : 0)) / 2);
}
function plyColor(i) { return (turnOf(G.fens[0]) === 'w') === (i % 2 === 0) ? 'w' : 'b'; }

function renderMoves() {
  const box = $('movelist');
  box.innerHTML = '';
  if (!G.sans.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Ходов пока нет. Сделайте ход на доске или загрузите партию.';
    box.appendChild(p);
    return;
  }
  G.sans.forEach((san, i) => {
    const color = plyColor(i);
    if (color === 'w' || i === 0) {
      const no = document.createElement('span');
      no.className = 'no';
      no.textContent = `${plyNumber(i)}${color === 'w' ? '.' : '…'}`;
      box.appendChild(no);
    }
    const b = document.createElement('button');
    b.className = 'mv' + (G.ply === i + 1 ? ' cur' : '');
    b.dataset.ply = String(i + 1);
    b.appendChild(document.createTextNode(san));
    if (review && review.moves[i]) {
      const cat = CAT_BY_KEY[review.moves[i].cat];
      if (['brilliant', 'great', 'inaccuracy', 'mistake', 'blunder'].includes(cat.key)) {
        const mb = document.createElement('span');
        mb.className = 'mb';
        mb.style.background = cat.color;
        mb.innerHTML = catIconSvg(cat.key);
        b.appendChild(mb);
      }
    }
    b.onclick = () => goTo(i + 1);
    box.appendChild(b);
  });
  keepInView(box, box.querySelector('.mv.cur'));
}

function commentText(i) {
  const m = review.moves[i];
  const bestUci = review.bests[i];
  const bestSan = bestUci && bestUci !== G.ucis[i] ? uciToSan(G.fens[i], bestUci) : null;
  const before = fmtCp(review.scores[i]);
  const after = fmtCp(review.scores[i + 1]);
  switch (m.cat) {
    case 'book': {
      const nm = openingName(book, G.sans.slice(0, i + 1));
      return nm ? `Теоретический ход. Дебют: ${nm}.` : 'Теоретический ход.';
    }
    case 'brilliant': return 'Блестящий ход: жертва материала, которая оправдана.';
    case 'great': return 'Замечательный ход: другие продолжения заметно слабее.';
    case 'best': return 'Лучший ход по мнению движка.';
    case 'excellent': return 'Отличный ход, почти не уступает лучшему.';
    case 'good': return 'Неплохой ход.' + (bestSan ? ` Сильнее было ${bestSan}.` : '');
    default: {
      const label = CAT_BY_KEY[m.cat].label;
      return `${label}. Оценка изменилась с ${before} на ${after}.` + (bestSan ? ` Лучше было ${bestSan}.` : '');
    }
  }
}

function renderComments() {
  const box = $('commentlist');
  box.innerHTML = '';
  G.sans.forEach((san, i) => {
    const m = review ? review.moves[i] : null;
    const row = document.createElement('button');
    row.className = 'crow' + (G.ply === i + 1 ? ' cur' : '');
    const badge = document.createElement('span');
    badge.className = 'badge';
    const t = document.createElement('div');
    t.className = 't';
    const head = document.createElement('b');
    head.textContent = `${plyNumber(i)}${plyColor(i) === 'w' ? '.' : '…'} ${san}`;
    t.appendChild(head);
    t.appendChild(document.createElement('br'));
    if (m) {
      const cat = CAT_BY_KEY[m.cat];
      badge.style.background = cat.color;
      badge.innerHTML = catIconSvg(cat.key);
      t.appendChild(document.createTextNode(commentText(i)));
    } else {
      badge.style.background = '#6b6862';
      badge.textContent = '…';
      t.appendChild(document.createTextNode('Считаю…'));
    }
    row.append(badge, t);
    row.onclick = () => goTo(i + 1);
    box.appendChild(row);
  });
  if (!G.sans.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Ходов пока нет.';
    box.appendChild(p);
  }
  keepInView(box, box.querySelector('.crow.cur'));
}

function renderGraph() {
  const card = $('graph-card');
  const n = G.fens.length;
  if (!review || n < 2) { card.style.display = 'none'; return; }
  const W = 300;
  const H = 70;
  const pts = [];
  review.scores.forEach((v, i) => {
    if (v != null) pts.push([(i / (n - 1)) * W, H - (winPct(v) / 100) * H]);
  });
  if (pts.length < 2) { card.style.display = 'none'; return; }
  card.style.display = '';
  const line = pts.map((p) => p.join(',')).join(' ');
  const area = `${pts[0][0]},${H} ${line} ${pts[pts.length - 1][0]},${H}`;
  const cx = (G.ply / (n - 1)) * W;
  $('graph').innerHTML = `
    <rect x="0" y="0" width="${W}" height="${H}" fill="#3b3936"></rect>
    <polygon points="${area}" fill="#e8e6e1"></polygon>
    <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#888" stroke-dasharray="3 3" stroke-width="1"></line>
    <polyline points="${line}" fill="none" stroke="#7cb342" stroke-width="1.6"></polyline>
    <line x1="${cx}" y1="0" x2="${cx}" y2="${H}" stroke="#ffcc33" stroke-width="1.6"></line>`;
}
$('graph').addEventListener('click', (e) => {
  if (!review) return;
  const rect = $('graph').getBoundingClientRect();
  const frac = (e.clientX - rect.left) / rect.width;
  goTo(Math.round(frac * (G.fens.length - 1)));
});

function renderStatus() {
  if (editor) { $('statusline').textContent = 'Режим редактора позиции'; return; }
  const c = cur();
  let s;
  if (c.isCheckmate()) s = `Мат. Победили ${c.turn() === 'w' ? 'чёрные' : 'белые'}.`;
  else if (c.isStalemate()) s = 'Пат. Ничья.';
  else if (c.isGameOver()) s = 'Ничья.';
  else s = (c.inCheck() ? 'Шах. ' : '') + `Ход ${c.turn() === 'w' ? 'белых' : 'чёрных'}.`;
  $('statusline').textContent = s;
}

function renderOpening() {
  const nm = G.startFen === START_FEN ? openingName(book, G.sans.slice(0, G.ply)) : null;
  $('opening').textContent = nm || '';
}

function renderInfo() {
  const h = G.headers || {};
  const parts = [];
  if (h.White || h.Black) parts.push(`${h.White || '?'} — ${h.Black || '?'}`);
  if (h.Result && h.Result !== '*') parts.push(h.Result);
  $('gameinfo').textContent = parts.join(' · ');
}

function renderAll() {
  renderBoard();
  renderStatus();
  renderOpening();
  renderEval();
  renderMoves();
  renderComments();
  renderGraph();
  renderPanel();
  renderInfo();
}

/* ---------- Анализ всей партии ---------- */
function setProgress() {
  const n = G.fens.length;
  let done = 0;
  for (let i = 0; i < n; i++) if (positionWhiteCp(i) != null) done++;
  const pct = n ? Math.round((done / n) * 100) : 0;
  const busy = done < n;
  $('progress').classList.toggle('on', busy);
  $('progressbar').style.width = pct + '%';
  $('btn-review').textContent = busy ? `Анализ партии: ${pct}%` : 'Пересчитать анализ';
}

async function runReview() {
  if (editor) { toast('Сначала закройте редактор позиции'); return; }
  if (engineState !== 'ready') { toast('Движок ещё не загружен или недоступен'); return; }
  for (const f of G.fens) EVAL.delete(f);
  requestAnalysis();
  toast('Анализ запущен заново');
}

/* ---------- Загрузка партий ---------- */
function resetGame(startFen, sans, ucis, fens, headers) {
  hideEditor();
  G.startFen = startFen;
  G.sans = sans;
  G.ucis = ucis;
  G.fens = fens;
  G.headers = headers || {};
  G.ply = 0;
  selected = null;
  targets = [];
  requestAnalysis();
}

function loadPgnText(raw) {
  const first = raw.trim().split(/\n\s*\n(?=\[)/)[0];
  if (!first) throw new Error('пусто');
  const c = new Chess();
  c.loadPgn(first);
  const hist = c.history({ verbose: true });
  if (!hist.length) throw new Error('в партии нет ходов');
  const startFen = hist[0].before;
  resetGame(
    startFen,
    hist.map((m) => m.san),
    hist.map((m) => m.from + m.to + (m.promotion || '')),
    [startFen, ...hist.map((m) => m.after)],
    c.header(),
  );
  if (raw.trim().split(/\n\s*\n(?=\[)/).length > 1) toast('В тексте несколько партий, загружена первая');
  else toast('Партия загружена');
}

function loadFen(fen) {
  const c = new Chess(fen.trim());
  resetGame(c.fen(), [], [], [c.fen()], {});
}

function safeLoad(fn) {
  try { fn(); } catch (e) { toast('Не удалось загрузить: ' + (e.message || e)); }
}

function renderGameList(items) {
  const box = $('gamelist');
  box.innerHTML = '';
  if (!items.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Партий не найдено.';
    box.appendChild(p);
    return;
  }
  for (const it of items) {
    const b = document.createElement('button');
    b.className = 'gitem';
    const t = document.createElement('strong');
    t.textContent = it.title;
    const s = document.createElement('span');
    s.textContent = it.sub;
    b.append(t, s);
    b.onclick = () => safeLoad(() => loadPgnText(it.pgn));
    box.appendChild(b);
  }
}

const dateRu = (ms) => new Date(ms).toLocaleDateString('ru-RU');

async function loadLichessGame(id) {
  const r = await fetch(`https://lichess.org/game/export/${id}?clocks=false&evals=false`, { headers: { Accept: 'application/x-chess-pgn' } });
  if (r.status === 404) throw new Error('партия не найдена');
  if (!r.ok) throw new Error('Lichess ответил ' + r.status);
  loadPgnText(await r.text());
}

async function lichessUserGames(name) {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(name)}?max=20&pgnInJson=true&clocks=false&evals=false&opening=false`;
  const r = await fetch(url, { headers: { Accept: 'application/x-ndjson' } });
  if (r.status === 404) throw new Error('игрок не найден');
  if (!r.ok) throw new Error('Lichess ответил ' + r.status);
  const text = (await r.text()).trim();
  if (!text) return [];
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((g) => g.pgn).map((g) => {
    const w = (g.players && g.players.white && g.players.white.user && g.players.white.user.name) || 'Аноним';
    const b = (g.players && g.players.black && g.players.black.user && g.players.black.user.name) || 'Аноним';
    const res = g.winner === 'white' ? '1–0' : g.winner === 'black' ? '0–1' : (g.status === 'draw' || g.status === 'stalemate') ? '½–½' : '—';
    return { title: `${w} — ${b}`, sub: `${res} · ${g.speed} · ${dateRu(g.createdAt)}`, pgn: g.pgn };
  });
}

async function chessComGames(name) {
  const u = encodeURIComponent(name.trim().toLowerCase());
  const ra = await fetch(`https://api.chess.com/pub/player/${u}/games/archives`);
  if (ra.status === 404) throw new Error('игрок не найден');
  if (!ra.ok) throw new Error('Chess.com ответил ' + ra.status);
  const archives = (await ra.json()).archives || [];
  let games = [];
  for (let k = archives.length - 1; k >= Math.max(0, archives.length - 2) && games.length < 20; k--) {
    const rg = await fetch(archives[k]);
    if (!rg.ok) continue;
    games = games.concat(((await rg.json()).games || []).reverse());
  }
  return games.filter((g) => g.pgn && (!g.rules || g.rules === 'chess')).slice(0, 20).map((g) => {
    const res = g.white.result === 'win' ? '1–0' : g.black.result === 'win' ? '0–1' : '½–½';
    return { title: `${g.white.username} — ${g.black.username}`, sub: `${res} · ${g.time_class} · ${dateRu(g.end_time * 1000)}`, pgn: g.pgn };
  });
}

async function withBusy(btn, fn) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Загружаю…';
  try { await fn(); } catch (e) { toast('Не удалось: ' + (e.message || e)); } finally { btn.disabled = false; btn.textContent = old; }
}

/* ---------- Подключение кнопок ---------- */
function bindUi() {
  const boardEl = $('board');
  const ghost = $('ghost');
  const squareAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const s = el && el.closest ? el.closest('[data-sq]') : null;
    return s ? s.dataset.sq : null;
  };

  boardEl.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-sq]');
    if (!el) return;
    const sq = el.dataset.sq;
    drag = { sq, from: null, piece: null, moved: false, x0: e.clientX, y0: e.clientY };
    if (!editor) {
      const c = cur();
      const p = c.get(sq);
      if (p && p.color === c.turn() && !c.isGameOver()) {
        drag.from = sq;
        drag.piece = p;
        selected = sq;
        targets = c.moves({ square: sq, verbose: true }).map((m) => m.to);
        renderBoard();
      }
    }
    try { boardEl.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
  });

  boardEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved) {
      if (!drag.from || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      drag.moved = true;
      const size = boardEl.getBoundingClientRect().width / 8;
      ghost.style.width = size + 'px';
      ghost.style.height = size + 'px';
      ghost.style.fontSize = size * 0.82 + 'px';
      ghost.className = 'piece ' + drag.piece.color;
      ghost.innerHTML = pieceSvg(drag.piece.type, drag.piece.color);
      ghost.style.display = 'flex';
      drag.half = size / 2;
      placeGhost(e.clientX, e.clientY, drag.half);
      renderBoard();
      e.preventDefault();
      return;
    }
    placeGhost(e.clientX, e.clientY, drag.half);
    e.preventDefault();
  });

  const finishDrag = (e, cancelled) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.moved) {
      const to = cancelled ? null : squareAt(e.clientX, e.clientY);
      if (to && to !== d.from && targets.includes(to)) {
        glideGhost(to, () => {
          ghost.style.display = 'none';
          ghost.style.transition = '';
          tryMove(d.from, to);
        });
        return;
      }
      ghost.style.display = 'none';
      selected = d.from;
      renderBoard();
      return;
    }
    if (!cancelled) onSquare(d.sq);
  };
  boardEl.addEventListener('pointerup', (e) => finishDrag(e, false));
  boardEl.addEventListener('pointercancel', (e) => finishDrag(e, true));
  $('nav-start').onclick = () => goTo(0);
  $('nav-prev').onclick = () => goTo(G.ply - 1);
  $('nav-next').onclick = () => goTo(G.ply + 1);
  $('nav-end').onclick = () => goTo(G.sans.length);
  $('btn-flip').onclick = () => { G.flipped = !G.flipped; renderAll(); };
  $('btn-reset').onclick = () => safeLoad(() => loadFen(START_FEN));

  $('depth-minus').onclick = () => { settings.depth = Math.max(6, settings.depth - 1); saveSettings(); EVAL.clear(); requestLive(); };
  $('depth-plus').onclick = () => { settings.depth = Math.min(24, settings.depth + 1); saveSettings(); EVAL.clear(); requestLive(); };
  $('live-toggle').onclick = () => {
    settings.live = !settings.live;
    saveSettings();
    requestLive();
  };
  $('btn-sound').onclick = () => {
    settings.sound = !settings.sound;
    saveSettings();
    $('btn-sound').textContent = 'Звук: ' + (settings.sound ? 'вкл' : 'выкл');
    if (settings.sound) beep(520);
  };
  $('btn-sound').textContent = 'Звук: ' + (settings.sound ? 'вкл' : 'выкл');

  $('btn-review').onclick = runReview;
  $('btn-comments').onclick = () => {
    showTab('comments');
    if (!review) toast('Сначала нажмите «Анализ партии»');
  };

  const showTab = (name) => {
    const isMoves = name === 'moves';
    $('tab-moves').classList.toggle('on', isMoves);
    $('tab-comments').classList.toggle('on', !isMoves);
    $('movelist').style.display = isMoves ? '' : 'none';
    $('commentlist').style.display = isMoves ? 'none' : '';
    if (!isMoves) renderComments();
  };
  $('tab-moves').onclick = () => showTab('moves');
  $('tab-comments').onclick = () => showTab('comments');

  document.querySelectorAll('[data-imp]').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('[data-imp]').forEach((x) => x.classList.toggle('on', x === b));
      document.querySelectorAll('.imp').forEach((p) => p.classList.toggle('on', p.id === 'imp-' + b.dataset.imp));
      $('gamelist').innerHTML = '';
    };
  });

  $('pgn-load').onclick = () => safeLoad(() => loadPgnText($('pgn-text').value));
  $('pgn-file-btn').onclick = () => $('pgn-file').click();
  $('pgn-file').onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const text = await f.text();
    $('pgn-text').value = text;
    safeLoad(() => loadPgnText(text));
    e.target.value = '';
  };

  $('li-go').onclick = () => withBusy($('li-go'), async () => {
    const v = $('li-input').value.trim();
    if (!v) return;
    const m = v.match(/lichess\.org\/(?:embed\/)?([A-Za-z0-9]{8})/);
    if (m) { await loadLichessGame(m[1]); return; }
    if (/^https?:\/\//i.test(v)) throw new Error('это не ссылка на партию Lichess');
    renderGameList(await lichessUserGames(v));
  });

  $('cc-go').onclick = () => withBusy($('cc-go'), async () => {
    const v = $('cc-input').value.trim();
    if (!v) return;
    if (/chess\.com/i.test(v)) throw new Error('по ссылке партию не загрузить: введите ник или вставьте PGN');
    renderGameList(await chessComGames(v));
  });

  $('fen-go').onclick = () => safeLoad(() => loadFen($('fen-input').value));

  $('btn-editor').onclick = () => { if (editor) closeEditor(); else openEditor(); };
  $('ed-cancel').onclick = closeEditor;
  $('ed-done').onclick = editorDone;
  $('ed-clear').onclick = () => { if (editor) { editor.board.clear(); renderBoard(); } };
  $('ed-start').onclick = () => {
    if (!editor) return;
    const c = new Chess(START_FEN);
    editor.board = new Map();
    for (const row of c.board()) for (const p of row) if (p) editor.board.set(p.square, { type: p.type, color: p.color });
    editor.turn = 'w';
    editor.castle = { K: true, Q: true, k: true, q: true };
    syncEditorUi();
    renderBoard();
  };
  $('turn-w').onclick = () => { if (editor) { editor.turn = 'w'; syncEditorUi(); } };
  $('turn-b').onclick = () => { if (editor) { editor.turn = 'b'; syncEditorUi(); } };
  for (const k of ['K', 'Q', 'k', 'q']) {
    $('castle-' + k).onchange = (e) => { if (editor) editor.castle[k] = e.target.checked; };
  }
}

/* ---------- Запуск ---------- */
const BOOK_BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/';
const bookPromise = Promise.all(['a', 'b', 'c', 'd', 'e'].map((l) => fetch(`${BOOK_BASE}${l}.tsv`).then((r) => {
  if (!r.ok) throw new Error('book');
  return r.text();
}))).then((texts) => { book = buildBook(texts); renderOpening(); renderComments(); return book; }).catch(() => null);

buildCats();
buildPalette();
bindUi();
renderAll();

engine.init().then(() => {
  engineState = 'ready';
  renderEval();
  requestAnalysis();
}).catch(() => {
  engineState = 'error';
  renderEval();
});

const params = new URLSearchParams(location.search);
if (params.get('lichess')) {
  loadLichessGame(params.get('lichess').slice(0, 8)).catch((e) => toast('Не удалось загрузить партию: ' + (e.message || e)));
}
