let _ctx: AudioContext | null = null

/**
 * Pre-create and resume an AudioContext during a user gesture (e.g. click to join voice).
 * Browsers require a user gesture to start AudioContext in "running" state;
 * creating one later (e.g. after an await) may leave it permanently "suspended".
 */
export function warmVoiceAudioCtx(): AudioContext {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new AudioContext()
  }
  if (_ctx.state === 'suspended') {
    _ctx.resume().catch(() => {})
  }
  return _ctx
}

export function getVoiceAudioCtx(): AudioContext | null {
  return _ctx
}

export function closeVoiceAudioCtx() {
  if (_ctx && _ctx.state !== 'closed') {
    _ctx.close().catch(() => {})
  }
  _ctx = null
}
