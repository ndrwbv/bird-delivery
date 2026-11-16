import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  define: {
    __BUILD__: JSON.stringify('VK · 0.6'),
    __RELEASE__: 'true',
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
