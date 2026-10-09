import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sfxIndex, MUSIC_DIR } from './tools/sfx-index.mjs';

// Версия сборки — подпись в углу заставки (src/main.js, __BUILD__). В CI релиз задаёт
// BUILD_VERSION=X.Y.Z (тот же номер, что тег и package.json) → «v0.0.8»; локально — «dev-<коммит>».
const buildLabel = () => {
  const v = (process.env.BUILD_VERSION || '').trim().replace(/^v/, '');
  if (v) return 'v' + v;
  try { return 'dev-' + execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return 'dev'; }
};
// релизная сборка — та, где CI задал BUILD_VERSION: в ней прячем тестовые кнопки (__RELEASE__, вернуть — ?debug)
const isRelease = () => !!(process.env.BUILD_VERSION || '').trim();

// Яндекс Игры: SDK v2 грузится с их домена по /sdk.js — классический скрипт в head: модуль игры (defer) выполнится после него.
// В dev без sdk-dev-proxy отдаём пустышку, чтобы не было 404; тогда yandex.js берёт yandex-mock.js.
const yandexSdk = () => ({
  name: 'yandex-sdk',
  transformIndexHtml: { order: 'post', handler: html => ({ html, tags: [{ tag: 'script', attrs: { src: '/sdk.js' }, injectTo: 'head' }] }) },
  configureServer (server) {
    server.middlewares.use('/sdk.js', (req, res) => { res.setHeader('Content-Type', 'text/javascript'); res.end('/* sdk.js: нет прокси — будет yandex-mock.js */'); });
  },
});

// Звуки из файлов (docs/SOUNDS.md): список public/sfx → sfx/index.json; музыка (docs/MUSIC.md): public/music →
// music/index.json. В dev — на каждый запрос заново (положил файл — F5), в сборке — файлом рядом с игрой
// (web, Стим через app://, Яндекс). Игра читает только их.
const fileList = (dir, list) => ({
  name: dir + '-index',
  configureServer (server) {
    server.middlewares.use('/' + dir + '/index.json', (req, res) => {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(list()));
    });
  },
  generateBundle () { this.emitFile({ type: 'asset', fileName: dir + '/index.json', source: JSON.stringify(list(), null, 1) + '\n' }); },
});
/* Редактор города (editor.html, docs/SANDBOX.md «Редактор города») — только в dev: читает и пишет
   пометки и правки карты в репозиторий: GET/POST /__editor/file?map=seversk&f=notes|edits →
   src/maps/<карта>/<f>.json. Записанное не перезагружает страницы (handleHotUpdate), но модуль правок
   сбрасывается — F5 в игре или «пересобрать город» в редакторе берёт свежие правки */
// одна пометка или правка — одна строка: файл легко читать глазами и в git diff
const pretty = j => '{\n' + Object.entries(j).map(([k, v]) => '  ' + JSON.stringify(k) + ': ' + (Array.isArray(v)
  ? (v.length ? '[\n' + v.map(x => '    ' + JSON.stringify(x)).join(',\n') + '\n  ]' : '[]') : JSON.stringify(v))).join(',\n') + '\n}\n';
const editorFiles = () => {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  const file = (map, f) => (/^[a-z]+$/.test(map || '') && (f === 'notes' || f === 'edits') && fs.existsSync(path.join(ROOT, 'src/maps', map, 'index.js'))) ? path.join(ROOT, 'src/maps', map, f + '.json') : null;
  return {
    name: 'editor-files',
    apply: 'serve',
    configureServer (server) {
      server.middlewares.use('/__editor/file', (req, res) => {
        const q = new URL(req.url, 'http://x').searchParams, f = file(q.get('map'), q.get('f'));
        const send = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); };
        if (!f) return send(400, { error: 'нет такой карты или файла' });
        if (req.method === 'GET') {
          try { return send(200, JSON.parse(fs.readFileSync(f, 'utf8'))); } catch (e) { return send(200, {}); }
        }
        if (req.method !== 'POST') return send(405, { error: 'GET или POST' });
        let body = '';
        req.on('data', c => { body += c; if (body.length > 8e6) req.destroy(); });
        req.on('end', () => {
          let j;
          try { j = JSON.parse(body); } catch (e) { return send(400, { error: 'не JSON' }); }
          const tmp = f + '.tmp';
          fs.writeFileSync(tmp, pretty(j));
          fs.renameSync(tmp, f);
          for (const m of server.moduleGraph.getModulesByFile(f) || []) server.moduleGraph.invalidateModule(m);   // F5 — свежие правки и при AGENT=1 (без слежения за файлами)
          send(200, { ok: true, path: path.relative(ROOT, f) });
        });
      });
    },
    handleHotUpdate (ctx) { if (/[\\/]src[\\/]maps[\\/][a-z]+[\\/](notes|edits)\.json$/.test(ctx.file)) return []; },
  };
};
const sfxList = () => [fileList('sfx', () => sfxIndex()), fileList('music', () => sfxIndex(MUSIC_DIR))];

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'yandex' ? [yandexSdk(), ...sfxList()] : [...sfxList(), editorFiles()],
  define: { __BUILD__: JSON.stringify(buildLabel()), __RELEASE__: JSON.stringify(isRelease()) },
  build: {
    target: 'es2022', outDir: 'dist/' + mode, assetsInlineLimit: 0, sourcemap: false, emptyOutDir: true,
    // sandbox.html — песочница для проверки механик (docs/SANDBOX.md): в web и Стиме есть, в Яндекс не попадает.
    // ui.html — песочница интерфейса (экраны без мира, docs/SANDBOX.md): только в web (и в dev).
    // В Стиме рядом с игрой — ещё страница диагностики геймпада (--page=pad.html)
    // editor.html — редактор города (docs/SANDBOX.md): только dev; в сборку — лишь для probe (BIRD_EDITOR=1, tools/probe-build.cjs)
    ...(mode !== 'yandex' ? { rollupOptions: { input: { index: 'index.html', sandbox: 'sandbox.html', ...(mode === 'web' ? { ui: 'ui.html' } : {}), ...(mode === 'steam' ? { pad: 'pad.html' } : {}), ...(process.env.BIRD_EDITOR ? { editor: 'editor.html' } : {}) } } } : {}),
  },
  // AGENT=1 — dev-сервер для агентов: не перезагружается от чужих правок (docs/AGENTS.md); свежий код — F5
  server: { host: '127.0.0.1', ...(process.env.AGENT ? { watch: null, hmr: false } : {}) },
}));
