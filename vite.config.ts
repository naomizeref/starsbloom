import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { validateAuthBuild } from './scripts/validate-auth-build';

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    // Read the same env files as Vite; deployment variables take precedence.
    // Only the provider name is logged. Never expose the environment object.
    const provider = validateAuthBuild({ ...loadEnv(mode, process.cwd(), ''), ...process.env });
    console.info(`[Bloom auth build] Frontend=${provider}, server=${provider}`);
  }
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
