type Sample = { timestamp: number; bytes: number; received: number; lost: number }
export type VoiceStatsHistory = Map<string, Sample>
export type VoiceDiagnostics = {
  receiveKbps: number | null
  packetLossPercent: number | null
  jitterMs: number | null
  roundTripMs: number | null
  transport: string | null
}
type Stat = {
  id: string
  type: string
  timestamp: number
  kind?: string
  bytesReceived?: number
  packetsReceived?: number
  packetsLost?: number
  jitter?: number
  selectedCandidatePairId?: string
  nominated?: boolean
  state?: string
  currentRoundTripTime?: number
  localCandidateId?: string
  remoteCandidateId?: string
  protocol?: string
  candidateType?: string
}

/** Receive metrics cover microphone tracks only. Loss and bitrate use interval deltas. */
export function summarizeVoiceStats(reports: RTCStatsReport[], previous: VoiceStatsHistory) {
  const history: VoiceStatsHistory = new Map()
  const metrics: VoiceDiagnostics = {
    receiveKbps: null,
    packetLossPercent: null,
    jitterMs: null,
    roundTripMs: null,
    transport: null
  }
  let received = 0,
    lost = 0,
    kbps = 0,
    intervals = 0
  for (const report of reports) {
    report.forEach((value: Stat) => {
      if (value.type === 'inbound-rtp' && value.kind === 'audio' && !history.has(value.id)) {
        const sample = {
          timestamp: value.timestamp,
          bytes: value.bytesReceived ?? 0,
          received: value.packetsReceived ?? 0,
          lost: value.packetsLost ?? 0
        }
        history.set(value.id, sample)
        if (value.jitter !== undefined) metrics.jitterMs = Math.max(metrics.jitterMs ?? 0, value.jitter * 1000)
        const before = previous.get(value.id)
        if (
          before &&
          sample.timestamp > before.timestamp &&
          sample.bytes >= before.bytes &&
          sample.received >= before.received
        ) {
          kbps += ((sample.bytes - before.bytes) * 8) / (sample.timestamp - before.timestamp)
          received += sample.received - before.received
          lost += Math.max(0, sample.lost - before.lost)
          intervals++
        }
      }
      if (value.type !== 'transport' || !value.selectedCandidatePairId) return
      const pair = report.get(value.selectedCandidatePairId) as Stat | undefined
      if (!pair) return
      if (pair.currentRoundTripTime !== undefined)
        metrics.roundTripMs = Math.max(metrics.roundTripMs ?? 0, pair.currentRoundTripTime * 1000)
      const local = report.get(pair.localCandidateId ?? '') as Stat | undefined
      const remote = report.get(pair.remoteCandidateId ?? '') as Stat | undefined
      if (local?.protocol)
        metrics.transport = `${local.protocol.toUpperCase()}${remote?.candidateType === 'relay' || local.candidateType === 'relay' ? ' · TURN' : ''}`
    })
  }
  if (intervals) metrics.receiveKbps = kbps
  if (received + lost > 0) metrics.packetLossPercent = (lost / (received + lost)) * 100
  return { metrics, history }
}
