import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages serves a repo (non-user/org) site under /<repo>/, not / - example/ itself lives at
  // /klipp/example/, alongside docs/ at /klipp/docs/ on the same Pages site
  base: command === 'build' ? '/klipp/example/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      // Read the library straight from source during development — no build step in the loop.
      '@kvvasuu/klipp/react/camera-controls': fileURLToPath(new URL('../src/body/CameraControls.tsx', import.meta.url)),
      '@kvvasuu/klipp/react': fileURLToPath(new URL('../src/react.ts', import.meta.url)),
      '@kvvasuu/klipp': fileURLToPath(new URL('../src/index.ts', import.meta.url)),
    },
  },
}));
