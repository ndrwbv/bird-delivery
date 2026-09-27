import { defineConfig } from 'vite';

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
  build: {
    target: 'es2022', outDir: 'dist/' + mode, assetsInlineLimit: 0, sourcemap: false, emptyOutDir: true,
    // sandbox.html — песочница для проверки механик (docs/SANDBOX.md): в web и Стиме есть, в Яндекс не попадает.
    // В Стиме рядом с игрой — ещё страница диагностики геймпада (--page=pad.html)
    ...(mode !== 'yandex' ? { rollupOptions: { input: { index: 'index.html', sandbox: 'sandbox.html', ...(mode === 'steam' ? { pad: 'pad.html' } : {}) } } } : {}),
  },
  server: { host: '127.0.0.1' },
}));
