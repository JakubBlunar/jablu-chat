import { createLocalAudioTrack, type LocalAudioTrack, type Room } from 'livekit-client'
import { setLocalMicTransmissionEnabled } from './voiceLocalMic'

jest.mock('livekit-client', () => ({
  createLocalAudioTrack: jest.fn(),
  Track: { Source: { Microphone: 'microphone' } }
}))
jest.mock('@/lib/deviceSettings', () => ({ getValidatedDevices: async () => ({ audioInput: '' }) }))
jest.mock('@/lib/noiseReductionCapabilities', () => ({ canUseRnnoise: () => false }))
jest.mock('@/lib/voiceProcessingSettings', () => ({ getNoiseReductionMode: () => 'standard' }))
jest.mock('@/lib/voiceAudioCaptureOptions', () => ({
  buildAudioCaptureOptionsForMode: () => ({}),
  buildAudioCaptureOptions: () => ({})
}))
jest.mock('@/lib/rnnoiseMicrophone', () => ({ startRnnoiseMicrophone: jest.fn() }))

it('stops delayed capture without publishing after the caller mutes or disconnects', async () => {
  let resolve!: (track: LocalAudioTrack) => void
  jest.mocked(createLocalAudioTrack).mockReturnValueOnce(
    new Promise((r) => {
      resolve = r
    })
  )
  const publishTrack = jest.fn()
  const room = { localParticipant: { getTrackPublication: () => undefined, publishTrack } } as unknown as Room
  let valid = true
  const pending = setLocalMicTransmissionEnabled(room, true, () => valid)
  await Promise.resolve()
  valid = false
  const stop = jest.fn()
  resolve({ stop } as unknown as LocalAudioTrack)
  await pending
  expect(stop).toHaveBeenCalledTimes(1)
  expect(publishTrack).not.toHaveBeenCalled()
})
