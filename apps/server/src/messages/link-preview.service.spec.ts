import { Test, TestingModule } from '@nestjs/testing'
import { lookup } from 'dns/promises'
import { LinkPreviewService } from './link-preview.service'
import { PrismaService } from '../prisma/prisma.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'

jest.mock('dns/promises', () => ({ lookup: jest.fn() }))

const mockLookup = lookup as unknown as jest.Mock

function htmlResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init
  })
}

function page(head: string): string {
  return `<html><head>${head}</head><body>filler</body></html>`
}

describe('LinkPreviewService', () => {
  let service: LinkPreviewService
  let prisma: MockPrismaService
  let fetchMock: jest.Mock

  beforeEach(async () => {
    prisma = createMockPrismaService()
    // Echo the rows back with ids, the way createManyAndReturn does.
    prisma.linkPreview.createManyAndReturn.mockImplementation(
      ({ data }: { data: Record<string, unknown>[] }) =>
        Promise.resolve(data.map((row, i) => ({ id: `lp-${i}`, ...row })))
    )

    mockLookup.mockReset()
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])

    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const module: TestingModule = await Test.createTestingModule({
      providers: [LinkPreviewService, { provide: PrismaService, useValue: prisma }]
    }).compile()

    service = module.get(LinkPreviewService)
  })

  describe('extractUrls', () => {
    it('extracts URLs from content', () => {
      const urls = service.extractUrls('Check out https://example.com and http://foo.bar/path?q=1')
      expect(urls).toEqual(['https://example.com', 'http://foo.bar/path?q=1'])
    })

    it('returns empty for null content', () => {
      expect(service.extractUrls(null)).toEqual([])
    })

    it('limits to 5 URLs', () => {
      const content = Array.from({ length: 10 }, (_, i) => `https://example.com/${i}`).join(' ')
      expect(service.extractUrls(content)).toHaveLength(5)
    })
  })

  it('cancels one consumer without cancelling another message using the same URL', async () => {
    let finish!: (response: Response) => void
    let aborted = false
    fetchMock.mockImplementation((_url: string, options: RequestInit) => new Promise<Response>((resolve, reject) => {
      finish = resolve
      options.signal!.addEventListener('abort', () => { aborted = true; reject(options.signal!.reason) })
    }))
    const first = service.generatePreviews('first', 'https://example.com/shared', 'alice')
    const second = service.generatePreviews('second', 'https://example.com/shared', 'bob')
    await new Promise(resolve => setImmediate(resolve))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    service.cancelMessage('first')
    expect(aborted).toBe(false)
    finish(htmlResponse(page('<meta property="og:title" content="Shared">')))
    expect(await first).toEqual([])
    expect(await second).toHaveLength(1)
    expect(prisma.linkPreview.createManyAndReturn).toHaveBeenCalledTimes(1)
  })

  it('cancels unshared work without poisoning the failure cache, including DNS waits', async () => {
    mockLookup.mockImplementationOnce(() => new Promise(() => {}))
    const pending = service.generatePreviews('deleted', 'https://example.com/cancel')
    await new Promise(resolve => setImmediate(resolve))
    service.cancelMessage('deleted')
    expect(await pending).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
    fetchMock.mockResolvedValue(htmlResponse(page('<meta property="og:title" content="Retry">')))
    expect(await service.generatePreviews('retry', 'https://example.com/cancel')).toHaveLength(1)
  })

  describe('generatePreviews', () => {
    it('returns empty for content with no URLs', async () => {
      const result = await service.generatePreviews('msg-1', 'no links here')
      expect(result).toEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it.each([
      ['https://example.com/cat.gif', 'GIF'],
      ['https://media.tenor.com/something.gif', 'GIF'],
      ['https://media1.giphy.com/media/abc/giphy.gif', 'GIF'],
      ['https://example.com/photo.jpg', 'Image']
    ])('shortcuts %s without fetching', async (url, siteName) => {
      const result = await service.generatePreviews('msg-1', `look ${url}`)
      expect(result).toHaveLength(1)
      expect(result[0].siteName).toBe(siteName)
      expect(result[0].imageUrl).toBe(url)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('recognizes common image extensions', async () => {
      for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg']) {
        const result = await service.generatePreviews('msg-1', `https://example.com/photo${ext}`)
        expect(result).toHaveLength(1)
      }
    })

    it('treats an extensionless path as a page, not an image', async () => {
      fetchMock.mockResolvedValue(htmlResponse(page('<meta property="og:title" content="A page">')))
      const result = await service.generatePreviews('msg-1', 'https://example.com/photo')
      expect(result[0].title).toBe('A page')
    })

    it('decodes HTML entities in the stored title', async () => {
      fetchMock.mockResolvedValue(
        htmlResponse(page('<meta property="og:title" content="&quot;Clean&quot; Code, Horrible Performance">'))
      )

      const result = await service.generatePreviews('msg-1', 'ouch https://example.com/p/clean-code')
      expect(result[0].title).toBe('"Clean" Code, Horrible Performance')
    })

    it('previews both links when a message has two', async () => {
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(htmlResponse(page(`<meta property="og:title" content="Page ${url.slice(-1)}">`)))
      )

      const result = await service.generatePreviews('msg-1', 'first https://a.com/1 then https://b.com/2.')
      expect(result.map((p) => p.url)).toEqual(['https://a.com/1', 'https://b.com/2'])
      expect(result.map((p) => p.title)).toEqual(['Page 1', 'Page 2'])
    })

    it('keeps the good preview when the other link fails', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (url.startsWith('https://broken.com')) return Promise.reject(new Error('ECONNREFUSED'))
        return Promise.resolve(htmlResponse(page('<meta property="og:title" content="Fine">')))
      })

      const result = await service.generatePreviews('msg-1', 'https://broken.com/x https://ok.com/y')
      expect(result).toHaveLength(1)
      expect(result[0].url).toBe('https://ok.com/y')
    })

    it('skips pages with no title or description', async () => {
      fetchMock.mockResolvedValue(htmlResponse(page('<meta name="viewport" content="width=device-width">')))
      expect(await service.generatePreviews('msg-1', 'https://example.com/empty')).toEqual([])
      expect(prisma.linkPreview.createManyAndReturn).not.toHaveBeenCalled()
    })

    it('follows redirects and resolves relative images against the final URL', async () => {
      const redirect = new Response('ignored', {
        status: 301,
        headers: { location: 'https://www.example.com/final' }
      })
      fetchMock
        .mockResolvedValueOnce(redirect)
        .mockResolvedValueOnce(
          htmlResponse(
            page('<meta property="og:title" content="Moved"><meta property="og:image" content="/cover.png">')
          )
        )

      const result = await service.generatePreviews('msg-1', 'https://example.com/start')
      expect(result[0].imageUrl).toBe('https://www.example.com/cover.png')
      expect(redirect.bodyUsed).toBe(true)
    })

    it('releases the connection for a non-HTML response', async () => {
      const response = new Response('%PDF-1.7', {
        status: 200,
        headers: { 'content-type': 'application/pdf' }
      })
      fetchMock.mockResolvedValue(response)

      expect(await service.generatePreviews('msg-1', 'https://example.com/doc.pdf')).toEqual([])
      expect(response.bodyUsed).toBe(true)
    })

    it('releases the connection for an error response', async () => {
      const response = htmlResponse('<html>blocked</html>', { status: 403 })
      fetchMock.mockResolvedValue(response)

      expect(await service.generatePreviews('msg-1', 'https://example.com/blocked')).toEqual([])
      expect(response.bodyUsed).toBe(true)
    })

    it('refuses URLs that resolve to a private address', async () => {
      mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
      expect(await service.generatePreviews('msg-1', 'http://internal.local/admin')).toEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('refuses when any resolved address is private', async () => {
      mockLookup.mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.5', family: 4 }
      ])
      expect(await service.generatePreviews('msg-1', 'https://rebind.example/x')).toEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('fetches a repeated URL only once', async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(htmlResponse(page('<meta property="og:title" content="Cached">')))
      )

      await service.generatePreviews('msg-1', 'https://example.com/same')
      const second = await service.generatePreviews('msg-2', 'https://example.com/same')

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(second[0].title).toBe('Cached')
    })

    it('returns empty when persisting fails', async () => {
      fetchMock.mockResolvedValue(htmlResponse(page('<meta property="og:title" content="Doomed">')))
      prisma.linkPreview.createManyAndReturn.mockRejectedValue(new Error('db down'))

      expect(await service.generatePreviews('msg-1', 'https://example.com/x')).toEqual([])
    })

    describe('YouTube oEmbed', () => {
      const oembedJson = (id: string) => ({
        title: `Video ${id}`,
        author_name: 'Some Channel',
        provider_name: 'YouTube',
        thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
      })

      it('uses the oEmbed endpoint for youtu.be links and skips HTML scraping', async () => {
        fetchMock.mockImplementation((url: string) => {
          if (url.includes('/oembed?')) return Promise.resolve(new Response(JSON.stringify(oembedJson('8C-J2sRBMkQ'))))
          return Promise.resolve(htmlResponse(page('<title> - YouTube</title>')))
        })

        const result = await service.generatePreviews('msg-1', 'https://youtu.be/8C-J2sRBMkQ?is=f5zJ4HX83q9ClsG-')

        expect(result[0].title).toBe('Video 8C-J2sRBMkQ')
        expect(result[0].siteName).toBe('Some Channel')
        expect(result[0].imageUrl).toBe('https://i.ytimg.com/vi/8C-J2sRBMkQ/hqdefault.jpg')
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(String(fetchMock.mock.calls[0][0])).toContain('/oembed?')
      })

      it('uses oEmbed for watch, embed and shorts URLs', async () => {
        fetchMock.mockImplementation((url: string) => {
          const endpoint = new URL(url)
          const inner = endpoint.searchParams.get('url') ?? ''
          const id = /v=([a-zA-Z0-9_-]{11})|(?:embed|shorts)\/([a-zA-Z0-9_-]{11})/.exec(inner)?.slice(1).find(Boolean) ?? ''
          return Promise.resolve(new Response(JSON.stringify(oembedJson(id))))
        })

        for (const link of [
          'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          'https://www.youtube.com/embed/dQw4w9WgXcQ',
          'https://www.youtube.com/shorts/dQw4w9WgXcQ'
        ]) {
          const result = await service.generatePreviews(`msg-${link}`, link)
          expect(result[0].title).toBe('Video dQw4w9WgXcQ')
        }
      })

      it('falls back to HTML scraping when oEmbed fails', async () => {
        fetchMock.mockImplementation((url: string) => {
          if (String(url).includes('/oembed?')) return Promise.reject(new Error('oEmbed down'))
          return Promise.resolve(
            htmlResponse(page('<meta property="og:title" content="Scraped title"><meta property="og:image" content="/t.jpg">'))
          )
        })

        const result = await service.generatePreviews('msg-1', 'https://youtu.be/dQw4w9WgXcQ')
        expect(result[0].title).toBe('Scraped title')
      })

      it('does not persist a preview when oEmbed returns an error payload', async () => {
        fetchMock.mockImplementation((url: string) => {
          if (String(url).includes('/oembed?')) return Promise.resolve(new Response('not found', { status: 404 }))
          return Promise.resolve(htmlResponse(page('<title> - YouTube</title>')))
        })

        // The shell page has no og: tags and its title is "- YouTube"; the
        // oEmbed 404 (deleted/private video) must fall through to the shell,
        // whose title still gets stored — matching prior behavior for broken
        // links — so assert fetch order instead of a drop.
        const result = await service.generatePreviews('msg-1', 'https://youtu.be/dQw4w9WgXcQ')
        expect(result[0].title).toBe('- YouTube')
      })
    })
  })
})
