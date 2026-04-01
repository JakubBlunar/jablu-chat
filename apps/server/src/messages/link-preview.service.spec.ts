import { Test, TestingModule } from '@nestjs/testing'
import { LinkPreviewService } from './link-preview.service'
import { PrismaService } from '../prisma/prisma.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'

describe('LinkPreviewService', () => {
  let service: LinkPreviewService
  let prisma: MockPrismaService

  beforeEach(async () => {
    prisma = createMockPrismaService()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinkPreviewService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile()

    service = module.get(LinkPreviewService)
  })

  describe('extractUrls', () => {
    it('extracts URLs from content', () => {
      const content = 'Check out https://example.com and http://foo.bar/path?q=1'
      const urls = service.extractUrls(content)
      expect(urls).toEqual(['https://example.com', 'http://foo.bar/path?q=1'])
    })

    it('returns empty for null content', () => {
      expect(service.extractUrls(null)).toEqual([])
    })

    it('returns empty for content without URLs', () => {
      expect(service.extractUrls('just some text')).toEqual([])
    })

    it('deduplicates URLs', () => {
      const content = 'https://example.com and https://example.com again'
      expect(service.extractUrls(content)).toHaveLength(1)
    })

    it('limits to 5 URLs', () => {
      const content = Array.from({ length: 10 }, (_, i) => `https://example.com/${i}`).join(' ')
      expect(service.extractUrls(content)).toHaveLength(5)
    })
  })

  describe('generatePreviews', () => {
    it('returns empty for content with no URLs', async () => {
      const result = await service.generatePreviews('msg-1', 'no links here')
      expect(result).toEqual([])
    })

    it('creates GIF preview for .gif URLs', async () => {
      const preview = { id: 'lp-1', url: 'https://example.com/cat.gif', title: 'GIF', description: null, imageUrl: 'https://example.com/cat.gif', siteName: 'GIF' }
      prisma.linkPreview.create.mockResolvedValue(preview)

      const result = await service.generatePreviews('msg-1', 'look https://example.com/cat.gif')
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('GIF')
    })

    it('creates GIF preview for tenor URLs', async () => {
      const url = 'https://media.tenor.com/something.gif'
      prisma.linkPreview.create.mockResolvedValue({
        id: 'lp-1', url, title: 'GIF', description: null, imageUrl: url, siteName: 'GIF'
      })

      const result = await service.generatePreviews('msg-1', `check ${url}`)
      expect(result[0].siteName).toBe('GIF')
    })

    it('creates GIF preview for giphy URLs', async () => {
      const url = 'https://media1.giphy.com/media/abc/giphy.gif'
      prisma.linkPreview.create.mockResolvedValue({
        id: 'lp-1', url, title: 'GIF', description: null, imageUrl: url, siteName: 'GIF'
      })

      const result = await service.generatePreviews('msg-1', `here ${url}`)
      expect(result[0].siteName).toBe('GIF')
    })

    it('creates Image preview for image URLs', async () => {
      const url = 'https://example.com/photo.jpg'
      prisma.linkPreview.create.mockResolvedValue({
        id: 'lp-1', url, title: 'Image', description: null, imageUrl: url, siteName: 'Image'
      })

      const result = await service.generatePreviews('msg-1', `see ${url}`)
      expect(result[0].title).toBe('Image')
    })

    it('recognizes common image extensions', async () => {
      for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg']) {
        const url = `https://example.com/photo${ext}`
        prisma.linkPreview.create.mockResolvedValue({
          id: `lp-${ext}`, url, title: 'Image', description: null, imageUrl: url, siteName: 'Image'
        })

        const result = await service.generatePreviews('msg-1', url)
        expect(result).toHaveLength(1)
        jest.clearAllMocks()
      }
    })
  })
})
