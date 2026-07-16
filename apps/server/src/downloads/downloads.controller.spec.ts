import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import { DownloadsController } from './downloads.controller'

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
}))

const existsSyncMock = fs.existsSync as jest.Mock
const readdirSyncMock = fs.readdirSync as jest.Mock
const statSyncMock = fs.statSync as jest.Mock

function file(size: number, mtime: string) {
  return { isFile: () => true, size, mtime: new Date(mtime) }
}

describe('DownloadsController (listing)', () => {
  let controller: DownloadsController

  beforeEach(async () => {
    existsSyncMock.mockReset()
    readdirSyncMock.mockReset()
    statSyncMock.mockReset()
    existsSyncMock.mockReturnValue(true)

    const moduleRef = await Test.createTestingModule({
      controllers: [DownloadsController],
      providers: [{ provide: ConfigService, useValue: { get: (_k: string, d?: unknown) => d } }],
    }).compile()

    controller = moduleRef.get(DownloadsController)
  })

  it('returns only the latest version per platform', () => {
    readdirSyncMock.mockReturnValue([
      'Jablu_1.0.0_x64-setup.exe',
      'Jablu_1.0.1_x64-setup.exe',
      'Jablu_1.0.2_x64-setup.exe',
    ])
    statSyncMock.mockImplementation((p: string) => {
      if (p.includes('1.0.0')) return file(100, '2026-07-16T17:36:00Z')
      if (p.includes('1.0.1')) return file(110, '2026-07-16T18:58:00Z')
      return file(120, '2026-07-16T21:23:00Z')
    })

    const result = controller.listDownloads()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      filename: 'Jablu_1.0.2_x64-setup.exe',
      platform: 'windows',
      version: '1.0.2',
    })
  })

  it('compares by semver, not string order (1.0.10 > 1.0.9)', () => {
    readdirSyncMock.mockReturnValue(['Jablu_1.0.9_x64-setup.exe', 'Jablu_1.0.10_x64-setup.exe'])
    statSyncMock.mockImplementation((p: string) =>
      p.includes('1.0.10') ? file(120, '2026-07-10T00:00:00Z') : file(110, '2026-07-16T00:00:00Z')
    )

    const result = controller.listDownloads()

    expect(result).toHaveLength(1)
    expect(result[0].version).toBe('1.0.10')
  })

  it('keeps the latest of each platform when multiple OSes are present', () => {
    readdirSyncMock.mockReturnValue([
      'Jablu_1.0.1_x64-setup.exe',
      'Jablu_1.0.2_x64-setup.exe',
      'Jablu_1.0.1_x64.dmg',
      'Jablu_1.0.2_amd64.AppImage',
    ])
    statSyncMock.mockReturnValue(file(100, '2026-07-16T21:23:00Z'))

    const result = controller.listDownloads()

    const byPlatform = Object.fromEntries(result.map((d) => [d.platform, d.filename]))
    expect(result).toHaveLength(3)
    expect(byPlatform.windows).toBe('Jablu_1.0.2_x64-setup.exe')
    expect(byPlatform.macos).toBe('Jablu_1.0.1_x64.dmg')
    expect(byPlatform.linux).toBe('Jablu_1.0.2_amd64.AppImage')
  })

  it('returns an empty list when the downloads dir is absent', () => {
    existsSyncMock.mockReturnValue(false)
    expect(controller.listDownloads()).toEqual([])
  })
})
