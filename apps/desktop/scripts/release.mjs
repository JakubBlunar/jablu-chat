#!/usr/bin/env node
// End-to-end local release driver for @chat/desktop.
//
// Usage:
//   pnpm --filter @chat/desktop release [--bump=patch|minor|major] [--targets=win,linux] [--git-tag]
//
// Flags:
//   --bump=LEVEL       Run `npm version <LEVEL> --no-git-tag-version` on apps/desktop
//                      before building (LEVEL = patch | minor | major).
//   --git-tag          When used with --bump, also create the git commit + tag.
//   --targets=LIST     Comma-separated platforms to build. Default: win,linux
//                      (on Windows) or just `linux` (on Linux). `win` on Linux
//                      is silently skipped with a warning.
//
// Required env:
//   UPDATE_SIGNING_KEY_PATH   Path to Ed25519 private PEM (from keygen.mjs).
//   UPDATE_PUBLIC_KEY_PEM     PEM-encoded Ed25519 public key (baked into build).
//
// Deploy:
//   If apps/desktop/scripts/deploy.mjs exists, it is invoked at the end.
//   If not, release.mjs prints the artifact paths and exits cleanly.
//   Copy apps/desktop/scripts/deploy.mjs.example to deploy.mjs and fill in
//   your VPS credentials.

import { spawnSync } from 'node:child_process'
import { createPrivateKey, createPublicKey, sign, verify, randomBytes } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const desktopDir = resolve(here, '..')
const repoRoot = resolve(desktopDir, '..', '..')

// ─── Arg parsing ────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const flags = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const eq = a.indexOf('=')
      return eq === -1 ? [a.slice(2), 'true'] : [a.slice(2, eq), a.slice(eq + 1)]
    })
)

const bumpLevel = flags.bump
if (bumpLevel && !['patch', 'minor', 'major'].includes(bumpLevel)) {
  console.error(`[release] --bump must be patch, minor, or major (got: ${bumpLevel})`)
  process.exit(1)
}
const gitTag = flags['git-tag'] === 'true'
const onWindows = process.platform === 'win32'
const onLinux = process.platform === 'linux'

const defaultTargets = onWindows ? ['win', 'linux'] : ['linux']
const targets = (flags.targets ?? '')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean)
const activeTargets = targets.length > 0 ? targets : defaultTargets

for (const t of activeTargets) {
  if (!['win', 'linux'].includes(t)) {
    console.error(`[release] Unknown target: ${t}. Expected win or linux.`)
    process.exit(1)
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function run(cmd, cmdArgs, opts = {}) {
  console.log(`\n$ ${cmd} ${cmdArgs.join(' ')}`)
  const result = spawnSync(cmd, cmdArgs, {
    stdio: 'inherit',
    shell: onWindows,
    ...opts
  })
  if (result.status !== 0) {
    console.error(`[release] Command failed with exit code ${result.status}`)
    process.exit(result.status ?? 1)
  }
}

function required(name) {
  const v = process.env[name]
  if (!v || !v.trim()) {
    console.error(`[release] Missing required env var: ${name}`)
    process.exit(1)
  }
  return v
}

function toWslPath(winPath) {
  // F:\Projects\chat -> /mnt/f/Projects/chat
  const m = /^([a-zA-Z]):[\\/](.*)$/.exec(winPath)
  if (!m) return winPath
  const drive = m[1].toLowerCase()
  const rest = m[2].replace(/\\/g, '/')
  return `/mnt/${drive}/${rest}`
}

// ─── Validate env ───────────────────────────────────────────────────────

required('UPDATE_SIGNING_KEY_PATH')
required('UPDATE_PUBLIC_KEY_PEM')

if (!existsSync(process.env.UPDATE_SIGNING_KEY_PATH)) {
  console.error(`[release] Private key not found at ${process.env.UPDATE_SIGNING_KEY_PATH}`)
  process.exit(1)
}

// Fail fast if the embedded public key and the signing private key are not a
// matching Ed25519 pair. Otherwise we happily ship binaries whose clients
// silently reject every update until we rebuild with the right public key.
try {
  const privKey = createPrivateKey(readFileSync(process.env.UPDATE_SIGNING_KEY_PATH))
  if (privKey.asymmetricKeyType !== 'ed25519') {
    console.error(
      `[release] Private key at UPDATE_SIGNING_KEY_PATH must be Ed25519 (got ${privKey.asymmetricKeyType}).`
    )
    process.exit(1)
  }
  const pubKey = createPublicKey({ key: process.env.UPDATE_PUBLIC_KEY_PEM, format: 'pem' })
  if (pubKey.asymmetricKeyType !== 'ed25519') {
    console.error(`[release] UPDATE_PUBLIC_KEY_PEM must be Ed25519 (got ${pubKey.asymmetricKeyType}).`)
    process.exit(1)
  }
  const probe = randomBytes(32)
  const sig = sign(null, probe, privKey)
  if (!verify(null, probe, pubKey, sig)) {
    console.error('[release] UPDATE_PUBLIC_KEY_PEM is not the public counterpart of UPDATE_SIGNING_KEY_PATH.')
    console.error('[release] Rebuilding with these values would brick auto-update for every user.')
    process.exit(1)
  }
  console.log('[release] Signing keypair verified (Ed25519, public/private match).')
} catch (err) {
  console.error('[release] Failed to validate signing keypair:', err?.message ?? err)
  process.exit(1)
}

process.env.UPDATE_SIGNING_STRICT = '1'

// ─── Step 0: bump version ──────────────────────────────────────────────

if (bumpLevel) {
  console.log(`[release] Bumping apps/desktop version (${bumpLevel})...`)
  const versionArgs = ['version', bumpLevel]
  if (!gitTag) versionArgs.push('--no-git-tag-version')
  run('npm', versionArgs, { cwd: desktopDir })
}

// ─── Step 1: web build ─────────────────────────────────────────────────

console.log('[release] Building web assets for Electron (ELECTRON=1)...')
run('pnpm', ['--filter', '@chat/web', 'build'], {
  cwd: repoRoot,
  env: { ...process.env, ELECTRON: '1' }
})

// ─── Step 2: desktop build(s) ──────────────────────────────────────────

const wantWin = activeTargets.includes('win')
const wantLinux = activeTargets.includes('linux')

if (wantWin) {
  if (!onWindows) {
    console.warn('[release] Skipping Windows target: cannot build NSIS installer from non-Windows host.')
  } else {
    console.log('[release] Building Windows installer (electron-builder --win)...')
    run('pnpm', ['--filter', '@chat/desktop', 'exec', 'electron-builder', '--win'], { cwd: repoRoot })
  }
}

if (wantLinux) {
  if (onLinux) {
    console.log('[release] Building Linux AppImage (electron-builder --linux)...')
    run('pnpm', ['--filter', '@chat/desktop', 'exec', 'electron-builder', '--linux', 'AppImage'], { cwd: repoRoot })
  } else if (onWindows) {
    const wslRepoRoot = toWslPath(repoRoot)
    const privKeyWsl = toWslPath(process.env.UPDATE_SIGNING_KEY_PATH)
    console.log('[release] Building Linux AppImage inside WSL...')
    // Verify WSL availability up front with a clear message.
    const check = spawnSync('wsl.exe', ['--status'], { stdio: 'pipe' })
    if (check.status !== 0) {
      console.error('[release] WSL is not available. Install WSL (`wsl --install`) or run with --targets=win to skip Linux.')
      process.exit(1)
    }
    const script = [
      `set -euo pipefail`,
      `cd ${wslRepoRoot}`,
      // pnpm install inside WSL is a one-time cost; it's idempotent.
      `pnpm install --frozen-lockfile`,
      `export UPDATE_PUBLIC_KEY_PEM=${JSON.stringify(process.env.UPDATE_PUBLIC_KEY_PEM)}`,
      `export UPDATE_SIGNING_KEY_PATH=${JSON.stringify(privKeyWsl)}`,
      `export UPDATE_SIGNING_STRICT=1`,
      `export ELECTRON=1`,
      `pnpm --filter @chat/web build`,
      `pnpm --filter @chat/desktop exec electron-builder --linux AppImage`
    ].join(' && ')
    run('wsl.exe', ['-e', 'bash', '-lc', script])
  } else {
    console.warn('[release] Skipping Linux target on this platform.')
  }
}

// ─── Inventory ─────────────────────────────────────────────────────────

const releaseDir = join(desktopDir, 'release')
if (!existsSync(releaseDir)) {
  console.error(`[release] ${releaseDir} was not created; the build produced no artifacts.`)
  process.exit(1)
}

const artifacts = readdirSync(releaseDir).filter((name) => {
  const s = statSync(join(releaseDir, name))
  if (!s.isFile()) return false
  return /\.(exe|msi|dmg|pkg|AppImage|deb|rpm|snap|yml|yaml|sig|blockmap)$/i.test(name)
})

console.log('\n[release] Produced artifacts in release/:')
for (const a of artifacts) {
  const s = statSync(join(releaseDir, a))
  console.log(`  - ${a} (${(s.size / 1024 / 1024).toFixed(1)} MB)`)
}

// ─── Step 3: delegate to local deploy.mjs if present ──────────────────

const deployScript = join(here, 'deploy.mjs')
if (existsSync(deployScript)) {
  console.log(`\n[release] Running local deploy script: ${deployScript}`)
  await import(pathToFileURL(deployScript).href)
} else {
  console.log('\n[release] No deploy step configured.')
  console.log('[release] Copy the example to enable automatic upload:')
  console.log('  apps/desktop/scripts/deploy.mjs.example   -> apps/desktop/scripts/deploy.mjs')
  console.log('  apps/desktop/scripts/rollback.mjs.example -> apps/desktop/scripts/rollback.mjs')
  console.log('  (then edit the HOST / USER / PASSWORD / *_PATH constants at the top)')
  console.log(`\n[release] Artifacts left in: ${releaseDir}`)
}

console.log('\n[release] Done.')
