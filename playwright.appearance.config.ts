import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  testMatch: ['appearance-jinx.spec.ts', 'private-area-regressions.spec.ts', 'inbox-mentions.spec.ts'],
  retries: 0,
  timeout: 90_000,
  use: { ...base.use, baseURL: 'http://127.0.0.1:5180' },
  webServer: {
    command: 'pnpm --filter @chat/web dev --host 127.0.0.1 --port 5180 --strictPort',
    url: 'http://127.0.0.1:5180',
    reuseExistingServer: true,
    timeout: 30_000
  }
})
