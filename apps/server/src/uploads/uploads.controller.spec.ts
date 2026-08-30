import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import type { Response } from 'express'
import * as fs from 'fs'
import { resolve } from 'path'
import { UnifiedAuthGuard } from '../auth/unified-auth.guard'
import { UploadsController } from './uploads.controller'
import { UploadsService } from './uploads.service'
import { PrismaService } from '../prisma/prisma.service'

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
}))

const existsSyncMock = fs.existsSync as jest.Mock

function mockResponse() {
  const res: Partial<Response> & {
    setHeader: jest.Mock
    sendFile: jest.Mock
    status: jest.Mock
    json: jest.Mock
  } = {
    setHeader: jest.fn(),
    sendFile: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
  }
  res.status.mockReturnValue(res)
  res.json.mockReturnValue(res)
  return res as unknown as Response & {
    setHeader: jest.Mock
    sendFile: jest.Mock
    status: jest.Mock
    json: jest.Mock
  }
}

describe('UploadsController (file serving)', () => {
  const UPLOAD_DIR = resolve('/tmp/uploads')
  let controller: UploadsController

  beforeEach(async () => {
    existsSyncMock.mockReset()

    const moduleRef = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [
        { provide: UploadsService, useValue: { getUploadDir: () => UPLOAD_DIR, getMaxSizeMb: () => 50 } },
        { provide: PrismaService, useValue: {} },
        { provide: ConfigService, useValue: { get: (_k: string, d?: unknown) => d } },
      ],
    })
      .overrideGuard(UnifiedAuthGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = moduleRef.get(UploadsController)
  })

  it('serves attachments cross-origin so a different-origin desktop shell can embed them', () => {
    existsSyncMock.mockReturnValue(true)
    const res = mockResponse()

    controller.serveAttachment('photo.jpg', res)

    expect(res.setHeader).toHaveBeenCalledWith('Cross-Origin-Resource-Policy', 'cross-origin')
    expect(res.sendFile).toHaveBeenCalledWith(resolve(UPLOAD_DIR, 'attachments', 'photo.jpg'))
  })

  it('sets the cross-origin header for avatars and thumbnails too', () => {
    existsSyncMock.mockReturnValue(true)

    const avatarRes = mockResponse()
    controller.serveFile('a.png', avatarRes)
    expect(avatarRes.setHeader).toHaveBeenCalledWith('Cross-Origin-Resource-Policy', 'cross-origin')

    const thumbRes = mockResponse()
    controller.serveThumbnail('t.webp', thumbRes)
    expect(thumbRes.setHeader).toHaveBeenCalledWith('Cross-Origin-Resource-Policy', 'cross-origin')

    const emojiRes = mockResponse()
    controller.serveEmoji('wave.png', emojiRes)
    expect(emojiRes.setHeader).toHaveBeenCalledWith('Cross-Origin-Resource-Policy', 'cross-origin')
    expect(emojiRes.sendFile).toHaveBeenCalledWith(resolve(UPLOAD_DIR, 'emoji', 'wave.png'))
  })

  it('returns 404 without leaking the header when the file is missing', () => {
    existsSyncMock.mockReturnValue(false)
    const res = mockResponse()

    controller.serveAttachment('missing.jpg', res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.setHeader).not.toHaveBeenCalled()
    expect(res.sendFile).not.toHaveBeenCalled()
  })

  it('rejects path traversal attempts', () => {
    existsSyncMock.mockReturnValue(true)
    const res = mockResponse()

    controller.serveAttachment('../../etc/passwd', res)

    // Path separators are stripped (dots are kept), so it stays inside the dir.
    expect(res.sendFile).toHaveBeenCalledWith(resolve(UPLOAD_DIR, 'attachments', '....etcpasswd'))
  })
})
