import { defineConfig } from 'vite';
export default defineConfig(({ mode }) => ({
  base: './',
  build: { target: 'es2022', outDir: 'dist/' + mode, assetsInlineLimit: 0, sourcemap: false, emptyOutDir: true },
  server: { host: '127.0.0.1' },
}));
