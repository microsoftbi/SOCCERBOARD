import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  // 相对路径产物：构建后可直接用静态服务器或本地文件打开
  base: './',
  server: {
    port: 5173,
    host: '127.0.0.1',
    // 本地 FastAPI 服务端（SQLite + 媒体文件）
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: false,
      },
    },
  },
});
