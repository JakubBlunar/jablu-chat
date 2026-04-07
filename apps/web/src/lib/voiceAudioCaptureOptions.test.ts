import { buildAudioCaptureOptionsForMode } from './voiceAudioCaptureOptions'

describe('buildAudioCaptureOptionsForMode', () => {
  it('rnnoise forces noiseSuppression false', () => {
    const o = buildAudioCaptureOptionsForMode('rnnoise', undefined)
    expect(o.noiseSuppression).toBe(false)
    expect(o.channelCount).toBe(1)
  })

  it('standard includes deviceId when provided', () => {
    const o = buildAudioCaptureOptionsForMode('standard', 'abc')
    expect(o.deviceId).toEqual({ exact: 'abc' })
  })
})
