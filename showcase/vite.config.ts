import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Read the library straight from source during development — no build step in the loop.
      '@kvvasuu/klipp/react/body/orbital-controls': fileURLToPath(new URL('../src/body/OrbitalControls.tsx', import.meta.url)),
      '@kvvasuu/klipp/react': fileURLToPath(new URL('../src/react.ts', import.meta.url)),
      '@kvvasuu/klipp': fileURLToPath(new URL('../src/index.ts', import.meta.url)),
    },
  },
});
