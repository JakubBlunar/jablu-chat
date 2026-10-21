import { summarizeVoiceStats } from './voiceDiagnostics'

const report = (...stats: Record<string, unknown>[]) =>
  new Map(stats.map((s) => [s.id, s])) as unknown as RTCStatsReport
const audio = (overrides = {}) => ({
  id: 'audio',
  type: 'inbound-rtp',
  kind: 'audio',
  timestamp: 1000,
  bytesReceived: 1000,
  packetsReceived: 100,
  packetsLost: 2,
  jitter: 0.007,
  ...overrides
})

it('does not present missing interval data as zero loss or zero bandwidth', () => {
  const { metrics } = summarizeVoiceStats([report(audio())], new Map())
  expect(metrics).toMatchObject({ receiveKbps: null, packetLossPercent: null, jitterMs: 7, roundTripMs: null })
})

it('uses interval deltas, deduplicates reports and reads the selected ICE transport', () => {
  const before = summarizeVoiceStats([report(audio())], new Map())
  const current = report(
    audio({ timestamp: 4000, bytesReceived: 76000, packetsReceived: 198, packetsLost: 4 }),
    { id: 'transport', type: 'transport', selectedCandidatePairId: 'pair' },
    {
      id: 'pair',
      type: 'candidate-pair',
      currentRoundTripTime: 0.04,
      localCandidateId: 'local',
      remoteCandidateId: 'remote'
    },
    { id: 'local', type: 'local-candidate', protocol: 'tcp' },
    { id: 'remote', type: 'remote-candidate', candidateType: 'relay' }
  )
  const { metrics } = summarizeVoiceStats([current, current], before.history)
  expect(metrics).toMatchObject({
    receiveKbps: 200,
    packetLossPercent: 2,
    jitterMs: 7,
    roundTripMs: 40,
    transport: 'TCP · TURN'
  })
})

it('resets after counter changes and excludes video from microphone receive metrics', () => {
  const before = summarizeVoiceStats([report(audio())], new Map())
  const { metrics } = summarizeVoiceStats(
    [
      report(
        audio({ timestamp: 5000, bytesReceived: 100, packetsReceived: 1 }),
        audio({ id: 'video', kind: 'video', bytesReceived: 900000 })
      )
    ],
    before.history
  )
  expect(metrics.receiveKbps).toBeNull()
  expect(metrics.packetLossPercent).toBeNull()
})
