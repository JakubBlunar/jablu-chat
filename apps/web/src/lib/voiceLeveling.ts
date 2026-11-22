/** A separate compressor per microphone narrows loudness differences before
 * the listener's volume controls. Web Audio supplies automatic make-up gain. */
export function createVoiceLeveler(ctx: BaseAudioContext) {
  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = -45
  compressor.knee.value = 12
  compressor.ratio.value = 6
  compressor.attack.value = 0.008
  compressor.release.value = 0.45
  return compressor
}
