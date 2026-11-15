import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
export default defineConfig({cacheDir:'node_modules/.vite-audit',plugins:[react(),tailwindcss()],publicDir:'public',
 optimizeDeps:{entries:['tests/audit/index.html']},
 resolve:{alias:[{find:/^(?:\.\.\/|\.\/)+context\/OrbitContext$/,replacement:path.resolve('tests/audit/fixture.tsx')},{find:/^(?:\.\.\/|\.\/)+lib\/supabase$/,replacement:path.resolve('tests/audit/fixture.tsx')}]},
 // Test logins live in memory; hot reload must not reset them mid-audit.
 server:{hmr:false,host:'127.0.0.1',port:5188,strictPort:true},
});
