import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
export default defineConfig({
  cacheDir: 'node_modules/.vite-browser',
  plugins: [react(), tailwindcss()], publicDir: false,
  optimizeDeps: { entries: ['tests/browser/index.html'] },
  resolve: { alias: [
    { find: /^(?:\.\.\/)+context\/OrbitContext$/, replacement: path.resolve('tests/browser/fixture.ts') },
    { find: /^(?:\.\.\/)+lib\/supabase$/, replacement: path.resolve('tests/browser/fixture.ts') },
  ] },
  server: { host: '127.0.0.1', port: 5187, strictPort: true },
});
