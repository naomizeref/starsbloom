import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
export default defineConfig({
  cacheDir:'node_modules/.vite-clerk-test',plugins:[react(),tailwindcss()],publicDir:'public',
  optimizeDeps:{entries:['tests/clerk/index.html','tests/clerk/auth.html']},
  define:{'import.meta.env.VITE_AUTH_PROVIDER':JSON.stringify('clerk'),
    'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY':JSON.stringify('pk_test_fixture'),
    'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://fixture.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('fixture-public-key')},
  resolve:{alias:[{find:/^@clerk\/react(?:\/legacy)?$/,replacement:path.resolve('tests/clerk/sdk.tsx')},
    {find:/^(?:\.\.\/|\.\/)+context\/OrbitContext$/,replacement:path.resolve('tests/clerk/orbit.ts')}]},
  server:{host:'127.0.0.1',port:5189,strictPort:true,hmr:false},
});
