import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import checker from 'vite-plugin-checker'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'
import path from 'path'

const isElectronBuild = process.env.ELECTRON === '1'

export default defineConfig(({ command }) => ({
  base: isElectronBuild ? './' : '/',
  esbuild: command === 'build' ? { drop: ['console', 'debugger'] } : undefined,
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
    minify: 'esbuild',
    rollupOptions: {
      output: {
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
      '@': path.resolve(__dirname, './src')
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
