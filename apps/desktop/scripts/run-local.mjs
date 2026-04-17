#!/usr/bin/env node
// Tiny launcher for the git-ignored deploy.mjs / rollback.mjs scripts.
// Prints a helpful message if the local file hasn't been created yet.

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const name = process.argv[2]

if (!name || !['deploy', 'rollback'].includes(name)) {
  console.error('Usage: node run-local.mjs <deploy|rollback>')
  process.exit(1)
}

const target = join(here, `${name}.mjs`)
const example = join(here, `${name}.mjs.example`)

if (!existsSync(target)) {
  console.error(`[${name}] scripts/${name}.mjs not found.`)
  console.error('')
  console.error('Bootstrap:')
  console.error(`  cp apps/desktop/scripts/${name}.mjs.example apps/desktop/scripts/${name}.mjs`)
  console.error(`  # then edit HOST / USER / PASSWORD / *_PATH at the top of ${name}.mjs`)
  console.error('')
  console.error(`Template: ${example}`)
  process.exit(1)
}

await import(pathToFileURL(target).href)
