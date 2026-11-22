// Run from the repo root: node tests/auto-vad-replay.mjs [spoken-phrase.wav]
// Without a clip, eSpeak NG generates a short phrase. Uses the same Chromium
// executable override as the repo's Playwright tests.
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const web = new URL('../apps/web/', import.meta.url)
const webRequire = createRequire(new URL('package.json', web))
const { build } = await import(pathToFileURL(webRequire.resolve('vite')).href)
const clip = process.argv[2]
  ? await readFile(process.argv[2])
  : execFileSync('espeak-ng', ['--stdout', '-s', '155', 'Can you hear the first word and the quiet ending?'])

// Bundle the app's normal start/stop entry points for a blank, isolated page.
async function buildEntry(file, name) {
  const bundle = await build({
    configFile: false,
    root: fileURLToPath(web),
    envFile: false,
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    logLevel: 'error',
    resolve: { alias: { '@': fileURLToPath(new URL('src/', web)) } },
    build: {
      write: false,
      lib: { entry: fileURLToPath(new URL(file, web)), name, formats: ['iife'] }
    }
  })
  const { output } = Array.isArray(bundle) ? bundle[0] : bundle
  const entry = output.find((item) => item.type === 'chunk' && item.isEntry)
  return entry.code + `\nwindow.${name} = ${name}; void 0`
}
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined
const useEdge = !executablePath && process.platform === 'win32' && !existsSync(chromium.executablePath())
const browser = await chromium.launch({
  executablePath,
  channel: useEdge ? 'msedge' : undefined,
  args: ['--autoplay-policy=no-user-gesture-required']
})
try {
  const page = await browser.newPage()
  await page.route('**/*', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Local VAD replay</title>' })
  )
  await page.goto('http://localhost/')
  await page.evaluate(await buildEntry('src/lib/micMode.ts', 'jabluMic'))
  await page.evaluate(await buildEntry('src/lib/voiceLeveling.ts', 'jabluPlayback'))
  const report = await page.evaluate(async (base64) => {
    const ctx = new AudioContext()
    await ctx.resume()
    const decoded = await ctx.decodeAudioData(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer)
    const samples = decoded.getChannelData(0)
    let peak = 0
    for (const value of samples) peak = Math.max(peak, Math.abs(value))
    if (!peak) throw new Error('The speech clip is silent')
    const start = samples.findIndex((value) => Math.abs(value) > peak * 0.01)
    const end = samples.findLastIndex((value) => Math.abs(value) > peak * 0.01)
    const voice = ctx.createBuffer(1, end - start + 1, decoded.sampleRate)
    voice.copyToChannel(samples.subarray(start, end + 1), 0)

    const output = ctx.createMediaStreamDestination()
    const [track] = output.stream.getAudioTracks()
    const transitions = []
    function gate(open) {
      track.enabled = open
      transitions.push({ at: ctx.currentTime, open })
    }
    const publication = { track: { mediaStreamTrack: track, mute: () => gate(false), unmute: () => gate(true) } }
    const mic = window.jabluMic
    mic.setRoomGetter(() => ({ localParticipant: { getTrackPublication: () => publication } }))
    mic.setVadMode('auto')
    mic.startMicMode('activity')

    const phases = []
    let cursor = ctx.currentTime + 0.2
    function schedule(name, duration, buffer, gain = 1, rate = 1) {
      if (buffer) {
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.playbackRate.value = rate
        const volume = ctx.createGain()
        volume.gain.value = gain
        source.connect(volume).connect(output)
        source.start(cursor)
      }
      phases.push({ name, start: cursor, end: cursor + duration })
      cursor += duration
    }
    schedule('Quiet room', 2)
    for (const db of [-12, -36, -54]) {
      schedule(`Speech • peak ${db} dBFS`, voice.duration, voice, 10 ** (db / 20) / peak)
      schedule('Pause', 1.6)
    }
    for (const rate of [0.75, 1.4]) {
      schedule(`Quiet speech at ${rate}x`, voice.duration / rate, voice, 10 ** (-54 / 20) / peak, rate)
      schedule('Short pause', 0.45)
      schedule('Quiet restart', voice.duration, voice, 10 ** (-54 / 20) / peak)
      schedule('Long pause', 1.8)
    }
    // A repeatable broadband disturbance injected after capture processing.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 6, ctx.sampleRate)
    const data = noise.getChannelData(0)
    let seed = 12345
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      data[i] = (seed / 2 ** 31 - 1) * 0.01
    }
    schedule('Steady noise • peak -40 dBFS', noise.duration, noise)
    const background = ctx.createBufferSource()
    background.buffer = noise
    background.loop = true
    background.connect(output)
    background.start(cursor)
    schedule('Speech over steady noise', voice.duration, voice, 10 ** (-24 / 20) / peak)
    background.stop(cursor)
    schedule('Final silence', 1.6)
    const click = ctx.createBuffer(1, Math.round(0.008 * ctx.sampleRate), ctx.sampleRate)
    click.copyToChannel(data.slice(0, click.length), 0)
    schedule('Single click and silence', 1.4, click, 8)
    const fan = ctx.createBuffer(1, data.length, ctx.sampleRate)
    const fanSamples = fan.getChannelData(0)
    let lowPass = 0
    for (let i = 0; i < fanSamples.length; i++) {
      lowPass += 0.035 * (data[i] - lowPass)
      fanSamples[i] = lowPass + 0.003 * Math.sin((2 * Math.PI * 180 * i) / ctx.sampleRate)
    }
    schedule('Fan-like hum and airflow', fan.duration, fan)
    const continuingFan = ctx.createBufferSource()
    continuingFan.buffer = fan
    continuingFan.loop = true
    continuingFan.connect(output)
    continuingFan.start(cursor)
    schedule('Quiet speech over fan', voice.duration, voice, 10 ** (-36 / 20) / peak)
    continuingFan.stop(cursor)
    while (ctx.currentTime < cursor) await new Promise((resolve) => setTimeout(resolve, 100))
    await mic.stopMicMode(true)
    track.stop()
    await ctx.close()

    const gateReport = phases.map((phase) => {
      const events = transitions.filter((e) => e.at > phase.start && e.at < phase.end)
      let open = transitions.findLast((e) => e.at <= phase.start)?.open ?? false
      let previous = phase.start
      let firstOpen = open ? phase.start : null
      let openSeconds = 0
      for (const event of [...events, { at: phase.end, open: false }]) {
        if (open) openSeconds += event.at - previous
        if (event.open && firstOpen === null) firstOpen = event.at
        previous = event.at
        open = event.open
      }
      return {
        input: phase.name,
        durationMs: Math.round(1000 * (phase.end - phase.start)),
        firstOpenMs: firstOpen === null ? null : Math.round(1000 * (firstOpen - phase.start)),
        openMs: Math.round(1000 * openSeconds)
      }
    })
    const levels = []
    for (const inputPeak of [-36, -24, -12, -3]) {
      const render = new OfflineAudioContext(1, voice.length, voice.sampleRate)
      const source = render.createBufferSource()
      source.buffer = voice
      const input = render.createGain()
      input.gain.value = 10 ** (inputPeak / 20) / peak
      source.connect(input).connect(window.jabluPlayback.createVoiceLeveler(render)).connect(render.destination)
      source.start()
      const rendered = await render.startRendering()
      function rmsDb(buffer, scale) {
        let sum = 0
        for (const sample of buffer.getChannelData(0)) sum += (sample * scale) ** 2
        return 10 * Math.log10(sum / buffer.length)
      }
      levels.push({
        inputPeak,
        originalRmsDb: Number(rmsDb(voice, input.gain.value).toFixed(1)),
        balancedRmsDb: Number(rmsDb(rendered, 1).toFixed(1))
      })
    }
    return { gateReport, levels }
  }, clip.toString('base64'))
  console.table(report.gateReport)
  console.table(report.levels)
  // User-supplied recordings can contain their own pauses or unrelated sounds.
  // Use the controlled built-in phrase for repeatable regression checks.
  if (!process.argv[2]) {
    for (const phase of report.gateReport) {
      if (/speech|restart/i.test(phase.input)) {
        assert(phase.firstOpenMs !== null && phase.firstOpenMs < 400, `Late onset: ${phase.input}`)
        assert(phase.openMs > 0.85 * phase.durationMs, `Lost speech: ${phase.input}`)
      }
      if (phase.input === 'Short pause') assert(phase.openMs >= phase.durationMs - 1)
      if (phase.input === 'Quiet room' || phase.input.startsWith('Steady noise')) assert(phase.openMs < 200)
      if (phase.input === 'Fan-like hum and airflow') assert(phase.openMs < phase.durationMs * 0.75)
    }
    assert(report.levels.at(-1).balancedRmsDb - report.levels[0].balancedRmsDb < 15)
  }
} finally {
  await browser.close()
}
