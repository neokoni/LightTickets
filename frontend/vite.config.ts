import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

import { LT_DEFAULT_SERVER_URL } from './runtime-config.mjs';

export default defineConfig({
  envPrefix: 'LT_',
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.LT_SERVER_URL || LT_DEFAULT_SERVER_URL,
        changeOrigin: true,
      },
    },
  },
});
