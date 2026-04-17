import { ConfigService } from '@nestjs/config'
import { UpdatesController } from './updates.controller'

function makeController(envs: Record<string, string>): UpdatesController {
  const config = {
    get: (key: string, fallback?: string) => envs[key] ?? fallback ?? ''
  } as unknown as ConfigService
  return new UpdatesController(config)
}

describe('UpdatesController.checkCompat', () => {
  it('returns supported=true when no client is given', () => {
    const c = makeController({ MIN_CLIENT_VERSION: '1.0.0' })
    expect(c.checkCompat()).toMatchObject({ supported: true, reason: null })
  })

  it('returns supported=true when client >= min and no max set', () => {
    const c = makeController({ MIN_CLIENT_VERSION: '1.2.0' })
    expect(c.checkCompat('1.3.0')).toMatchObject({ supported: true, reason: null })
    expect(c.checkCompat('1.2.0')).toMatchObject({ supported: true, reason: null })
  })

  it('returns client-too-old when client < min', () => {
    const c = makeController({ MIN_CLIENT_VERSION: '2.0.0' })
    expect(c.checkCompat('1.9.9')).toMatchObject({ supported: false, reason: 'client-too-old' })
  })

  it('returns client-too-new when client > max', () => {
    const c = makeController({ MIN_CLIENT_VERSION: '1.0.0', MAX_CLIENT_VERSION: '2.0.0' })
    expect(c.checkCompat('2.0.1')).toMatchObject({ supported: false, reason: 'client-too-new' })
    expect(c.checkCompat('2.0.0')).toMatchObject({ supported: true })
  })

  it('tolerates v-prefixed version strings', () => {
    const c = makeController({ MIN_CLIENT_VERSION: '1.0.0' })
    expect(c.checkCompat('v1.2.3')).toMatchObject({ supported: true })
  })

  it('falls back to supported=true for unparseable versions', () => {
    const c = makeController({ MIN_CLIENT_VERSION: 'bogus' })
    expect(c.checkCompat('1.0.0')).toMatchObject({ supported: true })
  })
})
