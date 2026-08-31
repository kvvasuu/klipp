import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages serves a repo (non-user/org) site under /<repo>/, not /
  base: command === 'build' ? '/klipp/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      // Read the library straight from source during development — no build step in the loop.
      // The orbital-controls subpath needs its own entry: it's an opt-in export, not part of index.ts.
      '@kvvasuu/klipp/body/orbital-controls': fileURLToPath(new URL('../src/body/OrbitalControls.tsx', import.meta.url)),
      '@kvvasuu/klipp': fileURLToPath(new URL('../src/index.ts', import.meta.url)),
    },
  },
}));
