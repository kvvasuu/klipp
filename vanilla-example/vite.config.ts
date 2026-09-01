import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // deployed alongside example/ under the same GitHub Pages site, at /klipp/vanilla/
  base: command === 'build' ? '/klipp/vanilla/' : '/',
  resolve: {
    alias: {
      // Read the library straight from source during development — no build step in the loop.
      '@kvvasuu/klipp': fileURLToPath(new URL('../src/index.ts', import.meta.url)),
    },
  },
}));
