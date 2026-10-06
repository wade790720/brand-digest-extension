import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 擴充功能用相對路徑載入資源；app.html 是擴充功能的主頁面，background 是 service worker。
// 兩個 content script 要 IIFE 格式，另外用 esbuild 打包（scripts/build-content.mjs）。
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  build: {
    rollupOptions: {
      input: { app: path.resolve(import.meta.dirname, 'app.html'), background: path.resolve(import.meta.dirname, 'src/background.ts') },
      output: { entryFileNames: (c) => (c.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js') },
    },
  },
})
