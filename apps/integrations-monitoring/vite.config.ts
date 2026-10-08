import path from 'node:path';

import {
  fusionOpenPlugin,
  manifestCspPlugin,
  mkcertPlugin,
} from '@cognite/app-sdk/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // manifestCspPlugin() must stay first — its middleware sets the
  // Content-Security-Policy header before any HTML response is sent.
  plugins: [manifestCspPlugin(), react(), mkcertPlugin(), fusionOpenPlugin(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      // zod (a dependency) has comments containing `@__PURE__` in positions Rollup cannot use.
      // Rollup drops them itself and the build is unaffected, so keep them out of the output.
      onwarn(warning, warn) {
        if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('node_modules/zod/')) return;
        warn(warning);
      },
    },
  },
  server: {
    port: 3001,
  },
  worker: {
    format: 'es',
  },
});
