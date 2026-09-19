import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg'],
    manifest: { name: '小店记 · 补货与临期助手', short_name: '小店记', lang: 'zh-CN', start_url: '/', display: 'standalone', background_color: '#f5f7f5', theme_color: '#23634d', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] },
    workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], cleanupOutdatedCaches: true, navigateFallback: 'index.html' },
  })],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
