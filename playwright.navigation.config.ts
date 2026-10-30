import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  testMatch: 'navigation-recovery.spec.ts',
  retries: 0,
  use: { ...base.use, baseURL: 'http://127.0.0.1:5180' },
  webServer: {
    command: 'pnpm --filter @chat/web dev --host 127.0.0.1 --port 5180 --strictPort',
    url: 'http://127.0.0.1:5180',
    reuseExistingServer: false,
    timeout: 30_000
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit', launchOptions: {} } }
  ]
})
