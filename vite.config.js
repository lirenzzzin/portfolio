import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  server: { port: 5188, host: true },
  build: { outDir: 'dist', assetsInlineLimit: 0 },
});
