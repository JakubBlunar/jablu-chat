import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { loginAs } from './helpers'

// Uses the existing local test accounts. Run against the Vite dev server,
// API and LiveKit from docker-compose.dev.yml (no production credentials).
test.use({
  permissions: ['microphone'],
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  }
})

async function instrument(context: BrowserContext) {
  await context.addInitScript(() => {
    performance.setResourceTimingBufferSize(5000)
    const scope = window as typeof window & {
      auditTracks: MediaStreamTrack[]
      auditContexts: (AudioContext & { auditPlayback?: boolean })[]
    }
    scope.auditTracks = []
    scope.auditContexts = []
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (options) => {
      const stream = await getUserMedia(options)
      scope.auditTracks.push(...stream.getTracks())
      return stream
    }
    const Context = window.AudioContext
    window.AudioContext = class extends Context {
      auditPlayback = false
      constructor(options?: AudioContextOptions) {
        super(options)
        scope.auditContexts.push(this)
      }
      createMediaElementSource(element: HTMLMediaElement) {
        this.auditPlayback = true
        return super.createMediaElementSource(element)
      }
    }
  })
}

async function prepare(page: Page, role: 'admin' | 'user') {
  await loginAs(page, role)
  await page.evaluate(async () => {
    const { useSettingsStore } = await import('/src/stores/' + 'settings.store.ts')
    useSettingsStore.setState({
      locale: 'en',
      voiceJoinMuted: false,
      voiceJoinDeafened: false,
      noiseReductionMode: 'standard',
      micMode: 'always'
    })
  })
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  const server = await page.evaluate(async () => {
    const { useServerStore } = await import('/src/stores/' + 'server.store.ts')
    return useServerStore.getState().servers[0]
  })
  expect(server, 'Test account must belong to a server').toBeTruthy()
  await page.getByRole('button', { name: server.name, exact: true }).first().click()
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useChannelStore } = await import('/src/stores/' + 'channel.store.ts')
        return useChannelStore.getState().voiceChannels().length
      })
    )
    .toBeGreaterThan(0)
  return page.evaluate(async () => {
    const { useChannelStore } = await import('/src/stores/' + 'channel.store.ts')
    return useChannelStore.getState().voiceChannels()[0]
  })
}

async function join(page: Page, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await page.getByRole('button', { name: new RegExp(`^${escaped}(?:\\s+\\d+)?$`) }).click()
  await expect.poll(async () => (await voiceState(page)).connected).toBe(true)
}

async function voiceState(page: Page) {
  return page.evaluate(async () => {
    const { useVoiceConnectionStore } = await import(
      performance
        .getEntriesByType('resource')
        .find((entry) => new URL(entry.name).pathname === '/src/stores/voice-connection.store.ts')!.name
    )
    const state = useVoiceConnectionStore.getState()
    const scope = window as typeof window & {
      auditTracks: MediaStreamTrack[]
      auditContexts: (AudioContext & { auditPlayback?: boolean; sinkId?: string })[]
    }
    return {
      connected: !!state.room,
      muted: state.isMuted,
      deafened: state.isDeafened,
      pending: state.isMicrophonePending,
      microphoneError: state.microphoneError,
      reconnecting: state.isReconnecting,
      playbackBlocked: state.playbackBlocked,
      microphones:
        state.room?.localParticipant.getTrackPublications().filter((p: { source: string }) => p.source === 'microphone')
          .length ?? 0,
      remote: state.room?.remoteParticipants.size ?? 0,
      captured: scope.auditTracks.length,
      liveCapture: scope.auditTracks.filter((t) => t.readyState === 'live').length,
      outputs: scope.auditContexts.filter((ctx) => ctx.auditPlayback).map((ctx) => ctx.sinkId)
    }
  })
}

async function disconnect(page: Page) {
  if (!page.url().startsWith('http://localhost:5173')) return
  await page.evaluate(async () => {
    const { useVoiceConnectionStore } = await import(
      performance
        .getEntriesByType('resource')
        .find((entry) => new URL(entry.name).pathname === '/src/stores/voice-connection.store.ts')!.name
    )
    await useVoiceConnectionStore.getState().disconnect()
  })
}

test('data-track channel stays open on fresh-page joins and subsequent rejoins', async ({ context, page }) => {
  await instrument(context)
  await context.addInitScript(() => {
    const scope = window as typeof window & { auditDataChannels: RTCDataChannel[] }
    scope.auditDataChannels = []
    const createDataChannel = RTCPeerConnection.prototype.createDataChannel
    RTCPeerConnection.prototype.createDataChannel = function (label: string, options?: RTCDataChannelInit) {
      const channel = createDataChannel.call(this, label, options)
      scope.auditDataChannels.push(channel)
      return channel
    }
  })
  const unexpectedCloses: string[] = []
  page.on('console', (message) => {
    if (message.text().includes("publisher data channel 'DATA_TRACK_LOSSY' closed unexpectedly")) {
      unexpectedCloses.push(message.text())
    }
  })
  let voice = await prepare(page, 'admin')
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt === 2) {
        await page.reload()
        voice = await prepare(page, 'admin')
      }
      await join(page, voice.name)
      await expect.poll(async () => (await voiceState(page)).microphones).toBe(1)
      await expect
        .poll(() =>
          page.evaluate(() => {
            const scope = window as typeof window & { auditDataChannels: RTCDataChannel[] }
            return scope.auditDataChannels.filter((channel) => channel.label === '_data_track').at(-1)?.readyState
          })
        )
        .toBe('open')
      // Stay connected long enough to catch a server-side rejection after SCTP opens.
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const scope = window as typeof window & { auditDataChannels: RTCDataChannel[] }
            await new Promise((resolve) => setTimeout(resolve, 500))
            return scope.auditDataChannels.filter((channel) => channel.label === '_data_track').at(-1)?.readyState
          })
        )
        .toBe('open')
      expect(unexpectedCloses).toEqual([])
      await disconnect(page)
    }
  } finally {
    await disconnect(page)
  }
})

test('two callers: speaker routing, controls, metrics, reconnect, TCP and mobile layout', async ({
  browser,
  context,
  page
}, info) => {
  // Exercise actual TCP media rather than relying on the force-tcp simulator.
  // Filter both directions: a full-ICE server can discover UDP peer-reflexively
  // if the browser advertises local UDP candidates.
  await context.addInitScript(() => {
    const PeerConnection = window.RTCPeerConnection
    window.RTCPeerConnection = class extends PeerConnection {
      constructor(configuration?: RTCConfiguration) {
        super(configuration)
        this.addEventListener('icecandidate', (event) => {
          if (event.candidate?.protocol === 'udp') event.stopImmediatePropagation()
        }, true)
      }
    }
    const addCandidate = RTCPeerConnection.prototype.addIceCandidate
    RTCPeerConnection.prototype.addIceCandidate = function (candidate) {
      if (candidate?.candidate && / udp /i.test(candidate.candidate)) return Promise.resolve()
      return addCandidate.call(this, candidate)
    }
    const setDescription = RTCPeerConnection.prototype.setRemoteDescription
    RTCPeerConnection.prototype.setRemoteDescription = function (description) {
      return setDescription.call(this, {
        type: description.type,
        sdp: description.sdp?.replace(/^a=candidate:.* udp .*\r?\n/gim, '')
      })
    }
  })
  await instrument(context)
  const voice = await prepare(page, 'admin')
  const selected = await page.evaluate(async () => {
    const outputs = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === 'audiooutput' && !['default', 'communications'].includes(d.deviceId)
    )
    const { useSettingsStore } = await import('/src/stores/' + 'settings.store.ts')
    useSettingsStore.setState({ audioOutputDeviceId: outputs[0].deviceId })
    return outputs[0].deviceId
  })
  const otherContext = await browser.newContext({ permissions: ['microphone'] })
  await instrument(otherContext)
  const other = await otherContext.newPage()
  try {
    await join(page, voice.name) // empty room: playback context is created later
    await expect.poll(async () => (await voiceState(page)).microphones).toBe(1)
    const otherVoice = await prepare(other, 'user')
    expect(otherVoice.id).toBe(voice.id)
    await join(other, otherVoice.name)
    await expect.poll(async () => (await voiceState(page)).outputs).toContain(selected)
    await expect.poll(async () => (await voiceState(page)).remote).toBe(1)
    await page.getByRole('button', { name: 'Mute', exact: true }).first().click()
    await expect.poll(async () => (await voiceState(page)).muted).toBe(true)
    await page.getByRole('button', { name: 'Unmute', exact: true }).first().click()
    await expect.poll(async () => (await voiceState(page)).pending).toBe(false)
    await page.getByRole('button', { name: 'Deafen', exact: true }).first().click()
    await expect.poll(async () => (await voiceState(page)).deafened).toBe(true)
    await page.getByRole('button', { name: 'Undeafen', exact: true }).first().click()
    await expect.poll(async () => (await voiceState(page)).muted).toBe(false)
    await page.getByRole('button', { name: /Call quality/ }).click()
    await expect(page.getByRole('definition').filter({ hasText: /kbps/ })).toBeVisible({ timeout: 10000 })
    // ICE may already select TCP on the host's Docker/VPN network adapters.
    await expect(page.getByRole('definition').filter({ hasText: /^(UDP|TCP)( · TURN)?$/ })).toBeVisible()
    await page.evaluate(() => {
      const original = HTMLMediaElement.prototype.play
      Object.assign(window, { auditBlockPlayback: true })
      HTMLMediaElement.prototype.play = function () {
        if (
          this.hasAttribute('data-voice-key') &&
          (window as typeof window & { auditBlockPlayback: boolean }).auditBlockPlayback
        ) {
          return Promise.reject(new DOMException('Controlled autoplay block', 'NotAllowedError'))
        }
        return original.call(this)
      }
      document.querySelectorAll<HTMLAudioElement>('audio[data-voice-key]').forEach((audio) => audio.pause())
      window.dispatchEvent(new Event('voice:resume-audio'))
    })
    await expect(page.getByRole('button', { name: 'Enable audio', exact: true })).toBeVisible()
    await page.evaluate(() => Object.assign(window, { auditBlockPlayback: false }))
    await page.getByRole('button', { name: 'Enable audio', exact: true }).click()
    await expect.poll(async () => (await voiceState(page)).playbackBlocked).toBe(false)
    await page.evaluate(async () => {
      const { useVoiceConnectionStore } = await import(
        performance
          .getEntriesByType('resource')
          .find((entry) => new URL(entry.name).pathname === '/src/stores/voice-connection.store.ts')!.name
      )
      await useVoiceConnectionStore.getState().room.simulateScenario('signal-reconnect')
    })
    await expect.poll(async () => (await voiceState(page)).reconnecting, { timeout: 15000 }).toBe(false)
    await expect(page.getByRole('definition').filter({ hasText: 'TCP' })).toBeVisible({ timeout: 20000 })
    await page.screenshot({ path: info.outputPath('voice-desktop.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('button', { name: 'Windows app', exact: true })).toHaveCount(0)
    for (const name of ['Mute', 'Deafen', 'Turn on camera', 'Disconnect from voice']) {
      const button = page.getByRole('button', { name, exact: true }).filter({ visible: true }).first()
      await expect(button).toBeVisible()
      const box = await button.boundingBox()
      expect(box, name).toBeTruthy()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
    await page.screenshot({ path: info.outputPath('voice-mobile.png') })
  } finally {
    await disconnect(page)
    await disconnect(other)
    await otherContext.close()
  }
})

test('muted and deafened joins never capture or publish until explicitly enabled', async ({ context, page }) => {
  await instrument(context)
  const voice = await prepare(page, 'admin')
  for (const deafened of [false, true]) {
    await page.evaluate(async (deafened) => {
      const { useSettingsStore } = await import('/src/stores/' + 'settings.store.ts')
      useSettingsStore.setState({ voiceJoinMuted: !deafened, voiceJoinDeafened: deafened })
    }, deafened)
    const before = (await voiceState(page)).captured
    await join(page, voice.name)
    // Allow time for any incorrectly deferred microphone bootstrap to execute.
    await page.waitForTimeout(700)
    expect(await voiceState(page)).toMatchObject({ muted: true, deafened, microphones: 0, captured: before })
    await page
      .getByRole('button', { name: deafened ? 'Undeafen' : 'Unmute', exact: true })
      .first()
      .click()
    await expect.poll(async () => (await voiceState(page)).microphones).toBe(1)
    await disconnect(page)
    await expect.poll(async () => (await voiceState(page)).liveCapture).toBe(0)
  }
})

test('microphone permission failure remains muted and recovers through Retry microphone', async ({ context, page }) => {
  await instrument(context)
  const voice = await prepare(page, 'admin')
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    let denied = false
    navigator.mediaDevices.getUserMedia = (options) => {
      if (!denied) {
        denied = true
        return Promise.reject(new DOMException('Controlled test denial', 'NotAllowedError'))
      }
      return original(options)
    }
  })
  await join(page, voice.name)
  await expect(page.getByRole('button', { name: 'Retry microphone' })).toBeVisible()
  expect(await voiceState(page)).toMatchObject({ muted: true, microphones: 0, microphoneError: 'permission' })
  await page.getByRole('button', { name: 'Retry microphone' }).click()
  await expect.poll(async () => (await voiceState(page)).microphones).toBe(1)
  await expect(page.getByRole('button', { name: 'Retry microphone' })).toHaveCount(0)
  await disconnect(page)
})

test('local microphone check records standard and RNNoise audio and releases capture', async ({ context, page }) => {
  await instrument(context)
  await prepare(page, 'admin')
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-settings', { detail: 'voice' })))
  const dialog = page.getByRole('dialog')
  for (const rnnoise of [false, true]) {
    if (rnnoise) await dialog.getByRole('button', { name: 'RNNoise', exact: true }).click()
    await dialog.getByRole('button', { name: 'Test microphone', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible()
    await expect(dialog.getByRole('meter')).toBeVisible()
    await expect(dialog.getByLabel('Microphone test recording')).toBeVisible({ timeout: 10000 })
    await expect.poll(async () => (await voiceState(page)).liveCapture).toBe(0)
    expect((await voiceState(page)).connected).toBe(false)
  }
})

test('live processing changes restore voice activity and preserve mute', async ({ context, page }) => {
  await instrument(context)
  const voice = await prepare(page, 'admin')
  try {
    await join(page, voice.name)
    await expect.poll(async () => (await voiceState(page)).microphones).toBe(1)
    await page.getByRole('button', { name: 'Audio settings', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Voice Activity', exact: true }).click()
    await dialog.getByRole('button', { name: 'RNNoise', exact: true }).click()
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const resource = performance
            .getEntriesByType('resource')
            .find((entry) => new URL(entry.name).pathname === '/src/lib/rnnoiseMicrophone.ts')
          if (!resource) return false
          const { isRnnoiseMicrophoneActive } = await import(resource.name)
          return isRnnoiseMicrophoneActive()
        })
      )
      .toBe(true)
    await expect.poll(async () => (await voiceState(page)).microphones).toBe(1)
    const microphone = dialog.getByRole('combobox', { name: 'Microphone', exact: true })
    const option = await microphone.locator('option').last().getAttribute('value')
    await microphone.selectOption(option!)
    await expect.poll(async () => (await voiceState(page)).microphones).toBe(1)
    await dialog.getByRole('button', { name: 'Close settings', exact: true }).click()
    await page.getByRole('button', { name: 'Mute', exact: true }).first().click()
    await page.getByRole('button', { name: 'Audio settings', exact: true }).click()
    await dialog.getByRole('button', { name: 'Standard', exact: true }).click()
    await expect.poll(async () => (await voiceState(page)).microphones).toBe(0)
    expect((await voiceState(page)).muted).toBe(true)
    await dialog.getByRole('button', { name: 'Close settings', exact: true }).click()
    await page.getByRole('button', { name: 'Unmute', exact: true }).first().click()
    await expect.poll(async () => (await voiceState(page)).microphones).toBe(1)
    expect((await voiceState(page)).microphoneError).toBeNull()
  } finally {
    await disconnect(page)
    await expect.poll(async () => (await voiceState(page)).liveCapture).toBe(0)
  }
})
