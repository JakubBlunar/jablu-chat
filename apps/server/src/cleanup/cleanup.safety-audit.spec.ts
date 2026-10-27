import { mkdtemp, mkdir, writeFile, rm, symlink, access } from 'node:fs/promises'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { deletePlannedFile, localUploadPath, snapshotFile, walkFiles } from './cleanup-files'

jest.mock('node:fs/promises', () => {
  const real = jest.requireActual('node:fs/promises')
  return { ...real, unlink: jest.fn(real.unlink) }
})
describe('Cleanup file safety contracts', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'chat-cleanup-files-'))
    jest.mocked(fs.unlink).mockImplementation(jest.requireActual('node:fs/promises').unlink)
  })
  afterEach(async () => {
    if (!resolve(dir).startsWith(resolve(tmpdir()) + sep) || !dir.includes('chat-cleanup-files-'))
      throw new Error('Unsafe fixture path')
    await rm(dir, { recursive: true, force: true })
  })
  it('deletes a matching regular file and returns its actual bytes', async () => {
    await writeFile(join(dir, 'a'), '12345')
    const planned = await snapshotFile(dir, 'a', '/api/uploads/a')
    expect(await deletePlannedFile(planned!)).toBe(5)
    expect(await deletePlannedFile(planned!)).toBe(0)
  })
  it('propagates permission and I/O errors rather than reporting success', async () => {
    await writeFile(join(dir, 'a'), '123')
    const planned = await snapshotFile(dir, 'a', null)
    jest.mocked(fs.unlink).mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'EACCES' }))
    await expect(deletePlannedFile(planned!)).rejects.toThrow('permission denied')
    await access(join(dir, 'a'))
  })
  it('refuses files changed since review', async () => {
    await writeFile(join(dir, 'a'), '123')
    const planned = await snapshotFile(dir, 'a', null)
    await writeFile(join(dir, 'a'), 'replacement')
    await expect(deletePlannedFile(planned!)).rejects.toThrow('changed since review')
  })
  it('refuses paths outside the exact root', async () => {
    const root = join(dir, 'uploads')
    await mkdir(root)
    await writeFile(join(dir, 'sentinel'), 'keep')
    await expect(snapshotFile(root, '../sentinel', null)).rejects.toThrow('escapes')
    await access(join(dir, 'sentinel'))
  })
  it('refuses directory candidates and symlink traversal', async () => {
    const root = join(dir, 'uploads'),
      other = join(dir, 'other')
    await mkdir(root)
    await mkdir(other)
    await writeFile(join(other, 'sentinel'), 'keep')
    await symlink(other, join(root, 'link'), 'junction')
    await expect(snapshotFile(root, 'link/sentinel', null)).rejects.toThrow('symbolic')
    await expect(snapshotFile(dir, 'other', null)).rejects.toThrow('regular file')
    await access(join(other, 'sentinel'))
  })
  it('streams nested files with consistent paths and sizes', async () => {
    await mkdir(join(dir, 'nested'))
    await writeFile(join(dir, 'nested', 'a'), '123')
    const files = []
    for await (const file of walkFiles(dir)) files.push(file)
    expect(files).toMatchObject([{ path: 'nested/a', size: 3 }])
  })
  it('does not present a missing/unreadable storage root as zero', async () => {
    const read = async () => {
      for await (const _file of walkFiles(join(dir, 'missing'))) {
        /* consume */
      }
    }
    await expect(read()).rejects.toThrow()
  })
  it.each(['/api/uploads/../sentinel', '/api/uploads/%2e%2e/sentinel', '/api/uploads/a%5c..%5csentinel'])(
    'rejects unsafe URL %s',
    (value) => {
      expect(() => localUploadPath(value)).toThrow('Unsafe')
    }
  )
  it('normalizes absolute local upload URLs without query strings', () => {
    expect(localUploadPath('https://jablu.invalid/api/uploads/attachments/a.png?token=example')).toBe(
      'attachments/a.png'
    )
    expect(localUploadPath('https://other.invalid/image.png')).toBeNull()
  })
})
