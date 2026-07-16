#!/usr/bin/env node
// Jablu desktop release helper (Tauri, Windows).
//
// Usage:
//   node scripts/release.mjs [--bump <patch|minor|major|x.y.z>] [--notes "..."] [--upload]
//
// What it does:
//   1. (optional) bumps the version in tauri.conf.json, package.json and Cargo.toml
//   2. builds the web app + the Tauri NSIS installer (requires TAURI_SIGNING_PRIVATE_KEY)
//   3. stages the artifacts into apps/desktop/release-artifacts/ and writes latest.json
//   4. prints exactly which files to upload to which server directory
//   5. (optional, --upload) delegates to the gitignored scripts/upload.mjs for scp
//
// Env:
//   TAURI_SIGNING_PRIVATE_KEY           required for a signed updater build
//   TAURI_SIGNING_PRIVATE_KEY_PASSWORD  password for the signing key (if set)
//   UPDATE_PUBLIC_URL                   public base URL of the server that will host
//                                       updates, e.g. https://chat.example.com
//                                       (used to build the installer URL in latest.json)

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const desktopDir = resolve(__dirname, '..')
const repoRoot = resolve(desktopDir, '..', '..')
const srcTauriDir = join(desktopDir, 'src-tauri')
const artifactsDir = join(desktopDir, 'release-artifacts')

function parseArgs(argv) {
  const args = { bump: null, notes: '', upload: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--upload') args.upload = true
    else if (a === '--bump') args.bump = argv[++i]
    else if (a.startsWith('--bump=')) args.bump = a.slice('--bump='.length)
    else if (a === '--notes') args.notes = argv[++i] ?? ''
    else if (a.startsWith('--notes=')) args.notes = a.slice('--notes='.length)
  }
  return args
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function computeVersion(current, bump) {
  if (!bump) return current
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump
  const [maj, min, pat] = current.split('.').map((n) => parseInt(n, 10))
  if (bump === 'major') return `${maj + 1}.0.0`
  if (bump === 'minor') return `${maj}.${min + 1}.0`
  if (bump === 'patch') return `${maj}.${min}.${pat + 1}`
  throw new Error(`Invalid --bump value: ${bump} (use patch|minor|major|x.y.z)`)
}

function setVersion(version) {
  // tauri.conf.json
  const confPath = join(srcTauriDir, 'tauri.conf.json')
  const conf = readJson(confPath)
  conf.version = version
  writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n')

  // package.json
  const pkgPath = join(desktopDir, 'package.json')
  const pkg = readJson(pkgPath)
  pkg.version = version
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  // Cargo.toml (first version = "..." under [package])
  const cargoPath = join(srcTauriDir, 'Cargo.toml')
  let cargo = readFileSync(cargoPath, 'utf-8')
  cargo = cargo.replace(/^version = ".*"$/m, `version = "${version}"`)
  writeFileSync(cargoPath, cargo)
}

function run(cmd) {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: repoRoot })
}

function findInstaller() {
  const nsisDir = join(srcTauriDir, 'target', 'release', 'bundle', 'nsis')
  if (!existsSync(nsisDir)) throw new Error(`NSIS output not found at ${nsisDir}`)
  const exe = readdirSync(nsisDir).find((f) => f.endsWith('-setup.exe'))
  if (!exe) throw new Error(`No *-setup.exe found in ${nsisDir}`)
  const exePath = join(nsisDir, exe)
  const sigPath = `${exePath}.sig`
  if (!existsSync(sigPath)) {
    throw new Error(`Signature ${sigPath} not found. Did you set TAURI_SIGNING_PRIVATE_KEY?`)
  }
  return { exe, exePath, sigPath }
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  const confPath = join(srcTauriDir, 'tauri.conf.json')
  const currentVersion = readJson(confPath).version
  const version = computeVersion(currentVersion, args.bump)

  if (version !== currentVersion) {
    console.log(`Bumping version ${currentVersion} -> ${version}`)
    setVersion(version)
  } else {
    console.log(`Building current version ${version}`)
  }

  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
    console.warn(
      '\nWARNING: TAURI_SIGNING_PRIVATE_KEY is not set. The build will fail to produce updater\n' +
        'artifacts (.sig). Generate a key once with:  pnpm --filter @chat/desktop tauri signer generate -w tauri-signing.key\n' +
        'then export TAURI_SIGNING_PRIVATE_KEY (and its password) before releasing.\n'
    )
  }

  run('pnpm --filter @chat/web build')
  run('pnpm --filter @chat/desktop build')

  const { exe, exePath, sigPath } = findInstaller()

  const publicUrl = (process.env.UPDATE_PUBLIC_URL ?? 'https://your-server.example.com').replace(/\/+$/, '')
  const signature = readFileSync(sigPath, 'utf-8').trim()
  const latest = {
    version,
    notes: args.notes || `Jablu ${version}`,
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': {
        signature,
        url: `${publicUrl}/api/updates/${exe}`
      }
    }
  }

  // Stage artifacts
  rmSync(artifactsDir, { recursive: true, force: true })
  mkdirSync(artifactsDir, { recursive: true })
  copyFileSync(exePath, join(artifactsDir, exe))
  copyFileSync(sigPath, join(artifactsDir, `${exe}.sig`))
  const latestPath = join(artifactsDir, 'latest.json')
  writeFileSync(latestPath, JSON.stringify(latest, null, 2) + '\n')

  console.log('\n=== Release staged ===')
  console.log(`Version:   ${version}`)
  console.log(`Artifacts: ${artifactsDir}`)
  console.log('\nUpload the following to your server:')
  console.log(`  DOWNLOADS_DIR  <-  ${exe}`)
  console.log(`  UPDATES_DIR    <-  latest.json`)
  console.log(`  UPDATES_DIR    <-  ${exe}`)
  console.log(`  UPDATES_DIR    <-  ${exe}.sig`)
  if (process.env.UPDATE_PUBLIC_URL == null) {
    console.log('\nNOTE: UPDATE_PUBLIC_URL was not set; latest.json url uses a placeholder host.')
  }

  if (args.upload) {
    const uploaderPath = join(__dirname, 'upload.mjs')
    if (!existsSync(uploaderPath)) {
      console.error(
        '\n--upload requested but scripts/upload.mjs does not exist.\n' +
          'Copy scripts/upload.mjs.example to scripts/upload.mjs and fill in your SSH details.'
      )
      process.exit(1)
    }
    const mod = await import(pathToFileURL(uploaderPath).href)
    await mod.upload({
      artifactsDir,
      installer: exe,
      files: [exe, `${exe}.sig`, 'latest.json']
    })
  }
}

await main()
