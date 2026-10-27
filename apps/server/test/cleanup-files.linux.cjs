// Run in the documented disposable Linux container, never against app uploads.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { snapshotFile, deletePlannedFile } = require('/code/cleanup-files.ts')

async function main() {
  assert.equal(process.platform, 'linux')
  assert.notEqual(process.getuid(), 0, 'Permission tests must run as an unprivileged user')
  const root = '/fixture/uploads'
  await fs.mkdir(root)
  await fs.writeFile(`${root}/sentinel`, 'keep')
  await fs.writeFile(`${root}/permission`, '12345')
  const permission = await snapshotFile(root, 'permission', null)
  await fs.chmod(root, 0o500)
  await assert.rejects(deletePlannedFile(permission), (error) => error.code === 'EACCES')
  await fs.chmod(root, 0o700)
  assert.equal(await deletePlannedFile(permission), 5)
  console.log('PASS: EACCES is reported; retry deletes exactly the approved file')

  await fs.mkdir('/fixture/outside')
  await fs.writeFile('/fixture/outside/sentinel', 'outside')
  await fs.symlink('/fixture/outside', `${root}/link`)
  await assert.rejects(snapshotFile(root, 'link/sentinel', null), /symbolic links/)
  assert.equal(await fs.readFile('/fixture/outside/sentinel', 'utf8'), 'outside')
  console.log('PASS: Linux symlink traversal preserves data outside the root')

  await fs.writeFile(`${root}/changed`, 'original')
  const changed = await snapshotFile(root, 'changed', null)
  await fs.writeFile(`${root}/changed`, 'replacement')
  await assert.rejects(deletePlannedFile(changed), /changed since review/)
  console.log('PASS: replaced file is preserved')

  await fs.writeFile(`${root}/reclaim`, Buffer.alloc(32768))
  const reclaim = await snapshotFile(root, 'reclaim', null)
  let full = false
  for (let i = 0; i < 100; i++) {
    try {
      await fs.appendFile('/fixture/filler', Buffer.alloc(8192))
    } catch (error) {
      assert.equal(error.code, 'ENOSPC')
      full = true
      break
    }
  }
  assert.equal(full, true, 'The tmpfs must actually reach ENOSPC')
  assert.equal(await deletePlannedFile(reclaim), 32768)
  await fs.writeFile('/fixture/recovered', Buffer.alloc(16384))
  assert.equal(await deletePlannedFile(reclaim), 0)
  assert.equal(await fs.readFile(`${root}/sentinel`, 'utf8'), 'keep')
  console.log('PASS: cleanup works at ENOSPC, permits new writes, and retries idempotently')
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
