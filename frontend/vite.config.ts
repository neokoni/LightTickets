import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

import { DEFAULT_BACKEND_URL } from './runtime-config.mjs';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL || DEFAULT_BACKEND_URL,
        changeOrigin: true,
      },
    },
  },
});
