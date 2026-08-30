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
      // 后端 API 代理: /api/* -> http://127.0.0.1:3030/api/*
      // ⚠️ 这里必须用 127.0.0.1 而不是 localhost:
      //    Windows 上 localhost 会优先解析 IPv6 ::1, 但 NestJS 默认只绑 IPv4,
      //    就会出现 Vite 代理 ECONNREFUSED ::1:3030 的史诗级坑.
      '/api': {
        target: 'http://127.0.0.1:3030',
        changeOrigin: true,
      },
    },
  },
})
