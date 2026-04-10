import { config as loadEnv } from 'dotenv'
import { basename, dirname, resolve } from 'node:path'
import { defineConfig, env } from 'prisma/config'

/** Monorepo root when Prisma runs from `apps/server` (pnpm --filter); otherwise assume cwd is root. */
function resolveRepoRoot(): string {
  const cwd = process.cwd()
  if (basename(cwd) === 'server' && basename(dirname(cwd)) === 'apps') {
    return resolve(cwd, '../..')
  }
  return cwd
}

const root = resolveRepoRoot()
loadEnv({ path: resolve(root, '.env') })
loadEnv({ path: resolve(root, '.env.development'), override: true })
loadEnv({ path: resolve(root, '.env.local'), override: true })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts'
  },
  datasource: {
    url: env('DATABASE_URL')
  }
})
