import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

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

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'yandex' ? [yandexSdk()] : [],
  define: { __BUILD__: JSON.stringify(buildLabel()), __RELEASE__: JSON.stringify(isRelease()) },
  build: {
    target: 'es2022', outDir: 'dist/' + mode, assetsInlineLimit: 0, sourcemap: false, emptyOutDir: true,
    // sandbox.html — песочница для проверки механик (docs/SANDBOX.md): в web и Стиме есть, в Яндекс не попадает.
    // ui.html — песочница интерфейса (экраны без мира, docs/SANDBOX.md): только в web (и в dev).
    // В Стиме рядом с игрой — ещё страница диагностики геймпада (--page=pad.html)
    ...(mode !== 'yandex' ? { rollupOptions: { input: { index: 'index.html', sandbox: 'sandbox.html', ...(mode === 'web' ? { ui: 'ui.html' } : {}), ...(mode === 'steam' ? { pad: 'pad.html' } : {}) } } } : {}),
  },
  // AGENT=1 — dev-сервер для агентов: не перезагружается от чужих правок (docs/AGENTS.md); свежий код — F5
  server: { host: '127.0.0.1', ...(process.env.AGENT ? { watch: null, hmr: false } : {}) },
}));
