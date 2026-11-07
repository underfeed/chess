// Скачивает Stockfish (WASM, lite, однопоточная сборка) в папку engine/.
// Работает на Windows, Mac и Linux. Нужен только Node.js.
// Запуск из папки webapp:   node fetch_engine.mjs
// (для проверки можно передать готовый архив: node fetch_engine.mjs путь/к/stockfish.tgz)
import { execSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'engine');

// Минимальный разбор tar: возвращает массив {name, data}.
function untar(buf) {
  const files = [];
  let off = 0;
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const str = (from, len) => header.toString('utf8', from, from + len).replace(/\0.*$/s, '');
    const size = parseInt(str(124, 12).trim() || '0', 8);
    const type = str(156, 1);
    const prefix = str(345, 155);
    const name = (prefix ? prefix + '/' : '') + str(0, 100);
    off += 512;
    if (type === '0' || type === '') files.push({ name, data: buf.subarray(off, off + size) });
    off += Math.ceil(size / 512) * 512;
  }
  return files;
}

let tgz = process.argv[2];
let tmp = null;
try {
  if (!tgz) {
    tmp = mkdtempSync(join(tmpdir(), 'sf-'));
    console.log('Скачиваю пакет stockfish через npm...');
    execSync('npm pack stockfish --silent', { cwd: tmp, stdio: ['ignore', 'pipe', 'inherit'] });
    const found = readdirSync(tmp).find((f) => f.endsWith('.tgz'));
    if (!found) throw new Error('npm не создал архив. Проверьте интернет и повторите.');
    tgz = join(tmp, found);
  }

  const files = untar(gunzipSync(readFileSync(tgz)));
  const names = files.map((f) => f.name);
  // Ищем любую пару <имя>.js + <имя>.wasm. Предпочитаем однопоточную lite-сборку:
  // многопоточная на GitHub Pages не заработает (нет нужных заголовков).
  const score = (n) => (/lite/i.test(n) ? 2 : 0) + (/single/i.test(n) ? 1 : 0);
  const pairs = files
    .filter((f) => f.name.endsWith('.js') && names.includes(f.name.replace(/\.js$/, '.wasm')))
    .sort((a, b) => score(b.name) - score(a.name));
  const js = pairs[0];
  if (!js) {
    throw new Error('Не нашёл пару .js + .wasm в пакете. Все файлы пакета:\n' + names.join('\n'));
  }
  const wasm = files.find((f) => f.name === js.name.replace(/\.js$/, '.wasm'));
  console.log('Беру движок из пакета:', js.name);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, basename(js.name)), js.data);
  writeFileSync(join(outDir, basename(wasm.name)), wasm.data);
  writeFileSync(join(outDir, 'engine.json'), JSON.stringify({ file: basename(js.name) }) + '\n');
  console.log('Готово. В папке engine/ лежат:', basename(js.name), 'и', basename(wasm.name));
} catch (e) {
  console.error('Ошибка:', e.message || e);
  process.exitCode = 1;
} finally {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
}
