#!/usr/bin/env node
// Generate an Ed25519 keypair for signing update manifests.
// Writes the private key to the path passed as the first argument
// (or ./updater-private.pem if omitted) and prints the public key
// PEM to stdout.

import { generateKeyPairSync } from 'node:crypto'
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const outPath = resolve(process.argv[2] ?? 'updater-private.pem')

if (existsSync(outPath)) {
  console.error(`Refusing to overwrite existing key at ${outPath}`)
  console.error('Pass a different path, or delete the existing key first.')
  process.exit(1)
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519')

const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' })
const publicPem = publicKey.export({ type: 'spki', format: 'pem' })

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, privatePem, { mode: 0o600 })

console.error(`Private key written to ${outPath} (keep this offline).`)
console.error('Set UPDATE_PUBLIC_KEY_PEM to the following value when building:')
console.error('─'.repeat(60))
process.stdout.write(publicPem)
console.error('─'.repeat(60))
console.error('Set UPDATE_SIGNING_KEY_PATH to the private key path above when running release.mjs.')
