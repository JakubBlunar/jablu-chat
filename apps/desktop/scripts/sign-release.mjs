#!/usr/bin/env node
// Sign every release/latest*.yml with the Ed25519 private key at
// UPDATE_SIGNING_KEY_PATH, writing latest*.yml.sig next to each.

import { createPrivateKey, sign } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const releaseDir = resolve(here, '..', 'release')

const keyPath = process.env.UPDATE_SIGNING_KEY_PATH
const strict = process.env.UPDATE_SIGNING_STRICT === '1'

if (!keyPath) {
  if (strict) {
    console.error('[sign-release] UPDATE_SIGNING_KEY_PATH not set (strict mode).')
    process.exit(1)
  }
  console.warn('[sign-release] UPDATE_SIGNING_KEY_PATH not set — skipping signing. This build is NOT safe to publish.')
  process.exit(0)
}
if (!existsSync(keyPath)) {
  console.error(`[sign-release] Private key not found at ${keyPath}`)
  process.exit(1)
}

const privateKey = createPrivateKey(readFileSync(keyPath))
if (privateKey.asymmetricKeyType !== 'ed25519') {
  console.error(`[sign-release] Expected an ed25519 key, got ${privateKey.asymmetricKeyType}`)
  process.exit(1)
}

if (!existsSync(releaseDir)) {
  console.error(`[sign-release] ${releaseDir} does not exist — run electron-builder first.`)
  process.exit(1)
}

const manifests = readdirSync(releaseDir).filter((f) => /^latest.*\.ya?ml$/i.test(f))

if (manifests.length === 0) {
  console.error('[sign-release] No latest*.yml manifests found in release/')
  process.exit(1)
}

for (const name of manifests) {
  const full = join(releaseDir, name)
  const bytes = readFileSync(full)
  // Ed25519 takes the message directly; no hash algorithm argument.
  const signature = sign(null, bytes, privateKey)
  const sigPath = `${full}.sig`
  writeFileSync(sigPath, signature)
  console.log(`[sign-release] Signed ${name} -> ${name}.sig (${signature.length} bytes)`)
}
