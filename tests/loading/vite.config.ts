import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
export default defineConfig({
  cacheDir:'node_modules/.vite-loading-test', plugins:[react(),tailwindcss()],
  optimizeDeps:{entries:['index.html']},
  define:{'import.meta.env.VITE_AUTH_PROVIDER':JSON.stringify('clerk'),
    'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY':JSON.stringify('pk_test_fixture'),
    'import.meta.env.VITE_LOCAL_DEV':JSON.stringify('false'),
    'import.meta.env.VITE_MAINTENANCE_MODE':JSON.stringify('false'),
    'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://fixture.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('fixture-public-key')},
  resolve:{alias:[{find:/^@clerk\/react(?:\/legacy)?$/,replacement:path.resolve('tests/clerk/sdk.tsx')}]},
  server:{host:'127.0.0.1',port:5190,strictPort:true,hmr:false},
});
