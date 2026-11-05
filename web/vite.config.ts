import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    VitePWA({
      // A custom worker, because push and notification clicks need their own handlers.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // lib/update.ts registers the worker and decides when a new version takes over.
      injectRegister: false,
      // Sends the Cloudflare Access cookie with the manifest request (SPEC §1).
      useCredentials: true,
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'brand/*.svg'],
      manifest: {
        name: 'Tack',
        short_name: 'Tack',
        description: 'A minimal, fast personal task board.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Manifest colors can't read CSS tokens; these match the light theme's --bg.
        background_color: '#F4F5F8',
        theme_color: '#F4F5F8',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,json}'],
        // The emoji data is one large file, and the picker must work offline.
        maximumFileSizeToCacheInBytes: 4_000_000,
      },
    }),
  ],
  build: {
    target: 'es2022',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': `http://localhost:${process.env.PORT ?? 8097}`,
    },
  },
});
