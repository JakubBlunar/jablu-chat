import { BadRequestException } from '@nestjs/common'
import * as fs from 'fs'
import ffprobe from 'ffprobe'
import { AttachmentType } from '../prisma-client'
import { UploadsService } from './uploads.service'

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}))

jest.mock('sharp', () => {
  const instance = {
    resize: jest.fn().mockReturnThis(),
    webp: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toFile: jest.fn().mockResolvedValue(undefined),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('converted')),
    metadata: jest.fn().mockResolvedValue({ width: 800, height: 600 }),
  }
  const sharpFn = jest.fn().mockReturnValue(instance)
  return { __esModule: true, default: sharpFn, _instance: instance }
})

jest.mock('ffprobe', () => jest.fn())
jest.mock('ffprobe-static', () => ({ path: '/mock/ffprobe' }))

jest.mock('node:crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid')
}))

const mockConfig = {
  get: jest.fn((key: string, fallback?: any) => {
    if (key === 'UPLOAD_DIR') return '/tmp/uploads'
    if (key === 'MAX_UPLOAD_SIZE_MB') return 10
    return fallback
  })
}

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    buffer: Buffer.from('test-data'),
    originalname: 'photo.png',
    mimetype: 'image/png',
    size: 1024,
    fieldname: 'file',
    encoding: '7bit',
    stream: null as any,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  }
}

describe('UploadsService', () => {
  let service: UploadsService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new UploadsService(mockConfig as any)
  })

  describe('getMaxSizeMb', () => {
    it('returns the configured max size', () => {
      expect(service.getMaxSizeMb()).toBe(10)
    })
  })

  describe('getUploadDir', () => {
    it('returns resolved upload directory', () => {
      expect(service.getUploadDir()).toContain('uploads')
    })
  })

  describe('saveAttachment', () => {
    it('rejects files exceeding size limit', async () => {
      const file = makeFile({ size: 11 * 1024 * 1024 })

      await expect(service.saveAttachment(file)).rejects.toThrow(BadRequestException)
      await expect(service.saveAttachment(file)).rejects.toThrow('Max 10MB')
    })

    it('rejects disallowed MIME types', async () => {
      const file = makeFile({ mimetype: 'application/exe', originalname: 'virus.exe' })

      await expect(service.saveAttachment(file)).rejects.toThrow(BadRequestException)
      await expect(service.saveAttachment(file)).rejects.toThrow('not allowed')
    })

    it('falls back to extension-based MIME when mimetype is generic', async () => {
      const file = makeFile({ mimetype: 'application/octet-stream', originalname: 'image.png' })
      const result = await service.saveAttachment(file)

      expect(result.type).toBe(AttachmentType.image)
      expect(result.mimeType).toBe('image/png')
    })

    it('processes image files with dimensions and thumbnail', async () => {
      const file = makeFile({ mimetype: 'image/png' })
      const result = await service.saveAttachment(file)

      expect(result.type).toBe(AttachmentType.image)
      expect(result.width).toBe(800)
      expect(result.height).toBe(600)
      expect(result.thumbnailUrl).toContain('_thumb.webp')
      expect(result.url).toContain('test-uuid')
    })

    it('converts HEIC to JPEG', async () => {
      const file = makeFile({ mimetype: 'image/heic', originalname: 'photo.heic' })
      const result = await service.saveAttachment(file)

      expect(result.mimeType).toBe('image/jpeg')
      expect(result.url).toContain('.jpg')
    })

    it('classifies GIF correctly', async () => {
      const file = makeFile({ mimetype: 'image/gif', originalname: 'cat.gif' })
      const result = await service.saveAttachment(file)

      expect(result.type).toBe(AttachmentType.gif)
    })

    it('classifies video correctly', async () => {
      const ffMock = ffprobe as unknown as jest.Mock
      ffMock.mockResolvedValue({ streams: [{ codec_type: 'video', width: 1920, height: 1080 }] })

      const file = makeFile({ mimetype: 'video/mp4', originalname: 'clip.mp4' })
      const result = await service.saveAttachment(file)

      expect(result.type).toBe(AttachmentType.video)
      expect(result.width).toBe(1920)
      expect(result.height).toBe(1080)
    })

    it('returns null dimensions when ffprobe fails for video', async () => {
      const ffMock = ffprobe as unknown as jest.Mock
      ffMock.mockRejectedValue(new Error('ffprobe missing'))

      const file = makeFile({ mimetype: 'video/mp4', originalname: 'clip.mp4' })
      const result = await service.saveAttachment(file)

      expect(result.type).toBe(AttachmentType.video)
      expect(result.width).toBeNull()
      expect(result.height).toBeNull()
    })

    it('classifies non-media files as "file"', async () => {
      const file = makeFile({ mimetype: 'application/pdf', originalname: 'doc.pdf' })
      const result = await service.saveAttachment(file)

      expect(result.type).toBe(AttachmentType.file)
      expect(result.thumbnailUrl).toBeNull()
    })

    it('returns original filename', async () => {
      const file = makeFile({ originalname: 'my-photo.png' })
      const result = await service.saveAttachment(file)

      expect(result.filename).toBe('my-photo.png')
    })
  })

  describe('deleteFile', () => {
    const unlinkSync = fs.unlinkSync as unknown as jest.Mock

    it('deletes a file within the upload directory', () => {
      service.deleteFile('/api/uploads/attachments/test.png')
      expect(unlinkSync).toHaveBeenCalled()
    })

    it('does NOT delete when path escapes upload directory', () => {
      service.deleteFile('/api/uploads/../../etc/passwd')
      expect(unlinkSync).not.toHaveBeenCalled()
    })

    it('does not throw when file does not exist', () => {
      unlinkSync.mockImplementationOnce(() => { throw new Error('ENOENT') })
      expect(() => service.deleteFile('/api/uploads/attachments/missing.png')).not.toThrow()
    })
  })
})
