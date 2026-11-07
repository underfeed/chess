// Обёртка над Stockfish (WASM), который работает в Web Worker прямо в телефоне пользователя.
import { parseInfo } from './analysis.js';

const DEFAULT_FILE = 'stockfish-18-lite-single.js';

export class Engine {
  constructor() {
    this.worker = null;
    this.job = null;
    this.waiters = [];
    this.queue = Promise.resolve();
    this.name = 'Stockfish';
  }

  async init() {
    let file = DEFAULT_FILE;
    try {
      const r = await fetch('engine/engine.json', { cache: 'no-store' });
      if (r.ok) file = (await r.json()).file || file;
    } catch (e) {
      /* файла engine.json нет — используем имя по умолчанию */
    }
    this.worker = new Worker('engine/' + file);
    this.worker.onmessage = (e) => this._line(typeof e.data === 'string' ? e.data : String(e.data));
    this.worker.onerror = () => this._fail(new Error('Не удалось загрузить файлы движка'));
    await this._wait('uci', 'uciok', 30000);
    await this._wait('isready', 'readyok', 30000);
  }

  send(cmd) {
    this.worker.postMessage(cmd);
  }

  _wait(cmd, token, ms) {
    return new Promise((resolve, reject) => {
      const w = { token, resolve, reject };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w);
        reject(new Error('Движок не ответил'));
      }, ms);
      w.clear = () => clearTimeout(timer);
      this.waiters.push(w);
      this.send(cmd);
    });
  }

  _fail(err) {
    for (const w of this.waiters) {
      w.clear();
      w.reject(err);
    }
    this.waiters = [];
  }

  _result(job) {
    return [...job.lines.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l);
  }

  _line(line) {
    if (line.startsWith('id name ')) this.name = line.slice(8).trim();
    for (const w of [...this.waiters]) {
      if (line.startsWith(w.token)) {
        this.waiters = this.waiters.filter((x) => x !== w);
        w.clear();
        w.resolve();
      }
    }
    const job = this.job;
    if (!job) return;
    if (line.startsWith('bestmove')) {
      this.job = null;
      job.resolve(job.stopped ? null : this._result(job));
      if (job.onIdle) job.onIdle();
      return;
    }
    const info = parseInfo(line);
    if (info && !info.bound) {
      job.lines.set(info.multipv, info);
      if (job.onInfo) job.onInfo(this._result(job), info.depth);
    }
  }

  // Останавливает текущий поиск и ждёт, пока движок освободится.
  stop() {
    const job = this.job;
    if (!job) return Promise.resolve();
    return new Promise((resolve) => {
      job.stopped = true;
      job.onIdle = resolve;
      this.send('stop');
    });
  }

  // Анализ позиции. Новый запрос отменяет предыдущий (тот получит null).
  // Возвращает массив линий по возрастанию multipv: {depth, multipv, cp, mate, pv[]}.
  analyze(fen, { depth = 14, multipv = 1, onInfo = null } = {}) {
    this.stop();
    const run = async () => {
      await this.stop();
      return new Promise((resolve) => {
        this.job = { lines: new Map(), resolve, onInfo, stopped: false, onIdle: null };
        this.send(`setoption name MultiPV value ${multipv}`);
        this.send(`position fen ${fen}`);
        this.send(`go depth ${depth}`);
      });
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }
}
