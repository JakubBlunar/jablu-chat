import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import checker from 'vite-plugin-checker'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig(({ command }) => ({
  // The Tauri desktop shell serves the standard web build from tauri.localhost,
  // so a single base ("/") works for both web and desktop.
  base: '/',
  // Server URL baked in at build time for the desktop app (from VITE_SERVER_URL,
  // which the release script derives from UPDATE_PUBLIC_URL). Injected as compile-time
  // constants so they work under both Vite and the SWC/CommonJS jest transform, which
  // cannot parse `import.meta`. Consumers guard with `typeof` for the jest case.
  define: {
    __JABLU_SERVER_URL__: JSON.stringify(process.env.VITE_SERVER_URL ?? ''),
    __JABLU_DEV__: JSON.stringify(command === 'serve')
  },
  plugins: [
    react(),
    tailwindcss(),
    checker({ typescript: { tsconfigPath: './tsconfig.app.json' } }),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Jablu',
        short_name: 'Jablu',
        description: 'Self-hosted chat platform',
        theme_color: '#0f1017',
        background_color: '#0f1017',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
  build: {
    sourcemap: false,
    rolldownOptions: {
      output: {
        ...(command === 'build'
          ? {
              minify: {
                compress: {
                  dropConsole: true,
                  dropDebugger: true
                }
              }
            }
          : {}),
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react-syntax-highlighter')) return 'syntax-highlighter'
          if (
            id.includes('react-markdown') ||
            id.includes('rehype-') ||
            id.includes('remark-') ||
            id.includes('micromark') ||
            id.includes('mdast') ||
            id.includes('unist') ||
            id.includes('/hast') ||
            id.includes('property-information') ||
            id.includes('space-separated-tokens') ||
            id.includes('comma-separated-tokens') ||
            id.includes('decode-named-character-reference')
          ) {
            return 'markdown'
          }
          if (id.includes('livekit-client')) return 'livekit'
          if (id.includes('socket.io-client')) return 'socket-io'
          if (id.includes('@emoji-mart')) return 'emoji-mart'
          if (id.includes('simplebar')) return 'simplebar'
          if (id.includes('@dnd-kit')) return 'dnd-kit'
          if (id.includes('react-router')) return 'react-router'
          if (/node_modules\/(react-dom|scheduler)\//.test(id) || /node_modules\/react\//.test(id)) {
            return 'react-vendor'
          }
          return undefined
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
}))
