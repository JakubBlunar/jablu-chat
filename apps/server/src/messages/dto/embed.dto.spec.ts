import { validate } from 'class-validator'
import { EmbedDto } from './embed.dto'

async function check(data: Partial<EmbedDto>) {
  const dto = Object.assign(new EmbedDto(), data)
  return validate(dto)
}

describe('EmbedDto', () => {
  it('passes with no fields (all optional)', async () => {
    const errors = await check({})
    expect(errors).toHaveLength(0)
  })

  it('passes with valid fields', async () => {
    const errors = await check({
      title: 'Hello',
      description: 'World',
      url: 'https://example.com',
      imageUrl: 'https://example.com/image.png',
      siteName: 'Example',
    })
    expect(errors).toHaveLength(0)
  })

  it('fails when title exceeds 256 chars', async () => {
    const errors = await check({ title: 'x'.repeat(257) })
    expect(errors.some((e) => e.property === 'title')).toBe(true)
  })

  it('fails when description exceeds 2048 chars', async () => {
    const errors = await check({ description: 'x'.repeat(2049) })
    expect(errors.some((e) => e.property === 'description')).toBe(true)
  })

  it('fails when url is not a URL', async () => {
    const errors = await check({ url: 'not-a-url' })
    expect(errors.some((e) => e.property === 'url')).toBe(true)
  })

  it('fails when imageUrl is not a URL', async () => {
    const errors = await check({ imageUrl: 'javascript:alert(1)' })
    expect(errors.some((e) => e.property === 'imageUrl')).toBe(true)
  })

  it('fails when siteName exceeds 128 chars', async () => {
    const errors = await check({ siteName: 'x'.repeat(129) })
    expect(errors.some((e) => e.property === 'siteName')).toBe(true)
  })
})
