#!/usr/bin/env node
/* dist/yandex → release/yandex-<version>.zip, index.html в корне архива.
   Системный `zip` (есть в macOS и Linux). Запускается из `npm run build:yandex`.
   Заодно проверяет то, на чём чаще всего режет модерация: вес архива и
   абсолютные ссылки наружу в собранных файлах. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const LIMIT_MB = 100;     // лимит архива в консоли Яндекс Игр (см. docs/YANDEX.md)

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist/yandex');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const out = join(root, 'release', `yandex-${version}.zip`);

if (!existsSync(join(dist, 'index.html'))) { console.error('нет dist/yandex/index.html — сначала vite build --mode yandex'); process.exit(1); }

const html = readFileSync(join(dist, 'index.html'), 'utf8');
if (!html.includes('src="/sdk.js"')) console.warn('⚠ в index.html нет <script src="/sdk.js"> — SDK не подключится');

// внешние адреса в html/js/css: в Яндексе запросы наружу запрещены (кроме их доменов)
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(dist);
const ext = new Map();
for (const f of files.filter(f => /\.(html|js|css|json)$/.test(f))) {
  for (const m of readFileSync(f, 'utf8').matchAll(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)<]*/gi)) {
    const u = m[0];
    if (/^https?:\/\/(www\.)?w3\.org\//.test(u)) continue;          // xmlns в svg — не запрос
    ext.set(u.slice(0, 90), f.slice(dist.length + 1));
  }
}
if (ext.size) {
  console.warn(`⚠ внешние адреса в сборке (${ext.size}) — проверь, что это не запросы:`);
  for (const [u, f] of [...ext].slice(0, 20)) console.warn('   ' + u + '  ← ' + f);
}

mkdirSync(join(root, 'release'), { recursive: true });
rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', '-q', '-9', out, '.', '-x', '*.DS_Store', '-x', '__MACOSX/*'], { cwd: dist, stdio: 'inherit' });

const mb = statSync(out).size / 1024 / 1024;
console.log(`✓ ${out.slice(root.length + 1)} — ${mb.toFixed(2)} МБ, файлов: ${files.length}`);
if (mb > LIMIT_MB) console.warn(`⚠ архив больше ${LIMIT_MB} МБ — консоль его не примет`);
