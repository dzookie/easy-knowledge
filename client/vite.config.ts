import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3031,
    proxy: {
      // 后端 API 代理: /api/* -> http://localhost:3030/api/*
      '/api': {
        target: 'http://localhost:3030',
        changeOrigin: true,
      },
    },
  },
})
