import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Browser calls /yii/* and /node/*; the dev server proxies them to the backends.
const yii = process.env.PROXY_YII_URL ?? 'http://yii-web';
const node = process.env.PROXY_NODE_URL ?? 'http://node:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Anchored regex keys: a plain '/node' prefix would also capture '/node_modules/...'.
      '^/yii/': { target: yii, changeOrigin: true, rewrite: (p) => p.replace(/^\/yii/, '') },
      '^/node/': { target: node, changeOrigin: true, rewrite: (p) => p.replace(/^\/node/, '') },
    },
  },
});
