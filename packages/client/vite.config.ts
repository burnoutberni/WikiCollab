/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'vite.svg'],
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60,
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname === '/ws',
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  envDir: '../..',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          if (id.includes('@bhsd/codemirror-mediawiki')) {
            return 'mediawiki-editor';
          }

          if (id.includes('/codemirror/') || id.includes('@codemirror/')) {
            return 'codemirror';
          }

          if (
            id.includes('/yjs/') ||
            id.includes('/y-websocket/') ||
            id.includes('/y-indexeddb/') ||
            id.includes('/y-codemirror.next/') ||
            id.includes('/y-protocols/') ||
            id.includes('/lib0/')
          ) {
            return 'yjs';
          }

          if (id.includes('@radix-ui/')) {
            return 'radix';
          }

          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router-dom/')
          ) {
            return 'vendor';
          }

          if (id.includes('/lucide-react/')) {
            return 'icons';
          }

          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      shared: path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
});
