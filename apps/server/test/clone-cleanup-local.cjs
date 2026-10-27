// Local QA only. Source PostgreSQL is read with pg_dump; all schema writes and
// cleanup run in the explicitly named disposable container/database below.
const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const path = require('node:path')
const root = path.resolve(__dirname, '../../..')
const fixture = path.join(root, '.tmp-tests/cleanup-local-copy-20261027')
const target = 'chat-cleanup-implementation-20261027'
const database = 'cleanup_test_snapshot'
async function command(args, input, capture = false) {
  const child = spawn('docker', args, { stdio: ['pipe', capture ? 'pipe' : 'ignore', 'pipe'] })
  const errors = []
  const output = []
  if (capture) child.stdout.on('data', (data) => output.push(data))
  child.stderr.on('data', (data) => errors.push(data))
  if (input) child.stdin.end(input)
  else child.stdin.end()
  const code = await new Promise((resolve) => child.on('exit', resolve))
  if (code) {
    await fs.writeFile(path.join(fixture, 'private-error.log'), Buffer.concat(errors))
    throw new Error('Local-copy setup failed; see the private fixture error log')
  }
  return Buffer.concat(output).toString('utf8').trim()
}
async function main() {
  await fs.mkdir(fixture, { recursive: true })
  await command(['exec', target, 'createdb', '-U', 'cleanup_test', database])
  const source = spawn(
    'docker',
    ['exec', 'chat-postgres-1', 'sh', '-c', 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl'],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  )
  const restore = spawn(
    'docker',
    ['exec', '-i', target, 'psql', '-U', 'cleanup_test', '-d', database, '-v', 'ON_ERROR_STOP=1', '-q'],
    { stdio: ['pipe', 'ignore', 'pipe'] }
  )
  const errors = []
  source.stderr.on('data', (data) => errors.push(data))
  restore.stderr.on('data', (data) => errors.push(data))
  source.stdout.pipe(restore.stdin)
  const codes = await Promise.all([source, restore].map((child) => new Promise((resolve) => child.on('exit', resolve))))
  if (codes.some((code) => code !== 0)) {
    await fs.writeFile(path.join(fixture, 'private-error.log'), Buffer.concat(errors))
    throw new Error('Local-copy transfer failed')
  }
  for (const migration of ['20261027140000_storage_cleanup_safety', '20261027143000_storage_cleanup_references']) {
    const applied = await command(
      [
        'exec',
        target,
        'psql',
        '-U',
        'cleanup_test',
        '-d',
        database,
        '-Atc',
        `SELECT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '${migration}' AND finished_at IS NOT NULL)`
      ],
      undefined,
      true
    )
    if (applied === 't') continue
    await command(
      ['exec', '-i', target, 'psql', '-U', 'cleanup_test', '-d', database, '-v', 'ON_ERROR_STOP=1', '-q'],
      await fs.readFile(path.join(root, 'apps/server/prisma/migrations', migration, 'migration.sql'))
    )
  }
  await fs.cp(path.join(root, 'apps/server/uploads'), path.join(fixture, 'uploads'), {
    recursive: true,
    preserveTimestamps: true,
    errorOnExist: true,
    force: false
  })
  console.log('Disposable local database and upload copy prepared; source data was read only.')
}
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
