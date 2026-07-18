import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

import { LT_DEFAULT_SERVER_URL, LT_DEFAULT_WEB_PORT } from './runtime-config.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const webPort = Number(env.LT_WEB_PORT || LT_DEFAULT_WEB_PORT);

  return {
    envPrefix: 'LT_',
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: webPort,
      proxy: {
        '/api': {
          target: env.LT_SERVER_URL || LT_DEFAULT_SERVER_URL,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: webPort,
    },
  };
});
