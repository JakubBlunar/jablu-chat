import { resolveScreenShareMaxBitrate } from './screenShareBitrate'

describe('resolveScreenShareMaxBitrate', () => {
  it('uses fixed map for 1080p', () => {
    expect(
      resolveScreenShareMaxBitrate('1080p', 30, { width: 640, height: 480, frameRate: 30 })
    ).toBe(8_000_000)
  })

  it('calibrates native ultrawide ~3440x1440 @ 30 to ~20 Mbps', () => {
    const bps = resolveScreenShareMaxBitrate('native', 30, {
      width: 3440,
      height: 1440,
      frameRate: 30
    })
    expect(bps).toBe(20_000_000)
  })

  it('falls back to native map when dimensions missing', () => {
    expect(resolveScreenShareMaxBitrate('native', 30, { frameRate: 30 })).toBe(20_000_000)
    expect(resolveScreenShareMaxBitrate('native', 15, {})).toBe(8_600_000)
  })

  it('scales down for smaller native captures', () => {
    const bps = resolveScreenShareMaxBitrate('native', 30, {
      width: 1920,
      height: 1080,
      frameRate: 30
    })
    expect(bps).toBeGreaterThan(2_000_000)
    expect(bps).toBeLessThan(20_000_000)
  })

  it('clamps very large resolutions', () => {
    const bps = resolveScreenShareMaxBitrate('native', 30, {
      width: 7680,
      height: 4320,
      frameRate: 30
    })
    expect(bps).toBe(30_000_000)
  })
})
