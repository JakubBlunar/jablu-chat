import type { CameraQuality } from '@/lib/deviceSettings'
import type { MicMode, PttBinding, VadMode } from '@/lib/micMode'
import type { NoiseReductionMode } from '@/lib/voiceProcessingSettings'
import { applyAccentPreset, type AccentPreset } from '@/lib/accent'
import { electronAPI } from '@/lib/electron'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const CHANNEL_SIDEBAR_MIN = 200
export const CHANNEL_SIDEBAR_MAX = 320
const CHANNEL_SIDEBAR_DEFAULT = 256

const TABLET_QUERY = '(max-width: 1023px)'

function defaultMemberSidebarVisible(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return !window.matchMedia(TABLET_QUERY).matches
  } catch {
    return true
  }
}

function clampChannelWidth(w: number): number {
  return Math.max(CHANNEL_SIDEBAR_MIN, Math.min(CHANNEL_SIDEBAR_MAX, Math.round(w)))
}

export type ScreenShareResolution = '720p' | '1080p' | 'native'
export type ScreenShareFps = 5 | 15 | 20 | 30

const VALID_ACCENTS: AccentPreset[] = ['amber', 'teal', 'coral', 'indigo', 'rose', 'emerald']
const VALID_NOISE: NoiseReductionMode[] = ['standard', 'enhanced_browser', 'rnnoise']
const VALID_MIC: MicMode[] = ['always', 'activity', 'push-to-talk']
const VALID_VAD: VadMode[] = ['auto', 'manual']
const VALID_QUALITIES: CameraQuality[] = ['360p', '480p', '720p', '1080p']
const VALID_SS_RES: ScreenShareResolution[] = ['720p', '1080p', 'native']
const VALID_SS_FPS: ScreenShareFps[] = [5, 15, 20, 30]

export type SettingsSlice = {
  accent: AccentPreset
  memberSidebarVisible: boolean
  channelSidebarWidth: number
  collapsedCategoryIds: string[]
  audioInputDeviceId: string
  audioOutputDeviceId: string
  cameraDeviceId: string
  cameraQuality: CameraQuality
  backgroundBlurEnabled: boolean
  noiseReductionMode: NoiseReductionMode
  captureNoiseSuppression: boolean
  captureAutoGainControl: boolean
  captureEchoCancellation: boolean
  micMode: MicMode
  pttBinding: PttBinding
  vadThreshold: number
  vadMode: VadMode
  notifEnabled: boolean
  notifSoundEnabled: boolean
  screenShareResolution: ScreenShareResolution
  screenShareFps: ScreenShareFps
  serverUrl: string | null
  pwaInstallDismissedAt: number | null
}

type SettingsActions = {
  setAccent: (preset: AccentPreset) => void
  setMemberSidebarVisible: (v: boolean) => void
  toggleMemberSidebarVisible: () => void
  setChannelSidebarWidth: (w: number) => void
  toggleCollapsedCategory: (categoryId: string) => void
  isCategoryCollapsed: (categoryId: string) => boolean
  setAudioInputDeviceId: (id: string) => void
  setAudioOutputDeviceId: (id: string) => void
  setCameraDeviceId: (id: string) => void
  setCameraQuality: (q: CameraQuality) => void
  setBackgroundBlurEnabled: (v: boolean) => void
  setNoiseReductionMode: (mode: NoiseReductionMode) => void
  setCaptureNoiseSuppression: (on: boolean) => void
  setCaptureAutoGainControl: (on: boolean) => void
  setCaptureEchoCancellation: (on: boolean) => void
  setMicMode: (mode: MicMode) => void
  setPttBinding: (b: PttBinding) => void
  setVadThreshold: (n: number) => void
  setVadMode: (mode: VadMode) => void
  setNotifEnabled: (v: boolean) => void
  setNotifSoundEnabled: (v: boolean) => void
  patchNotifSettings: (p: Partial<{ enabled: boolean; soundEnabled: boolean }>) => void
  setScreenShareResolution: (r: ScreenShareResolution) => void
  setScreenShareFps: (f: ScreenShareFps) => void
  setServerUrl: (url: string | null) => void
  clearServerUrl: () => void
  setPwaInstallDismissedAt: (ts: number | null) => void
}

export type SettingsState = SettingsSlice & SettingsActions

const defaults: SettingsSlice = {
  accent: 'amber',
  memberSidebarVisible: defaultMemberSidebarVisible(),
  channelSidebarWidth: CHANNEL_SIDEBAR_DEFAULT,
  collapsedCategoryIds: [],
  audioInputDeviceId: '',
  audioOutputDeviceId: '',
  cameraDeviceId: '',
  cameraQuality: '720p',
  backgroundBlurEnabled: false,
  noiseReductionMode: 'standard',
  captureNoiseSuppression: true,
  captureAutoGainControl: true,
  captureEchoCancellation: true,
  micMode: 'always',
  pttBinding: { type: 'key', key: ' ' },
  vadThreshold: 18,
  vadMode: 'auto',
  notifEnabled: true,
  notifSoundEnabled: true,
  screenShareResolution: '1080p',
  screenShareFps: 15,
  serverUrl: null,
  pwaInstallDismissedAt: null
}

function coercePersisted(p: unknown): Partial<SettingsSlice> {
  if (!p || typeof p !== 'object') return {}
  const o = p as Record<string, unknown>
  const out: Partial<SettingsSlice> = {}

  if (typeof o.accent === 'string' && VALID_ACCENTS.includes(o.accent as AccentPreset))
    out.accent = o.accent as AccentPreset
  if (typeof o.memberSidebarVisible === 'boolean') out.memberSidebarVisible = o.memberSidebarVisible
  if (typeof o.channelSidebarWidth === 'number' && Number.isFinite(o.channelSidebarWidth))
    out.channelSidebarWidth = clampChannelWidth(o.channelSidebarWidth)
  if (Array.isArray(o.collapsedCategoryIds) && o.collapsedCategoryIds.every((x) => typeof x === 'string'))
    out.collapsedCategoryIds = o.collapsedCategoryIds
  if (typeof o.audioInputDeviceId === 'string') out.audioInputDeviceId = o.audioInputDeviceId
  if (typeof o.audioOutputDeviceId === 'string') out.audioOutputDeviceId = o.audioOutputDeviceId
  if (typeof o.cameraDeviceId === 'string') out.cameraDeviceId = o.cameraDeviceId
  if (typeof o.cameraQuality === 'string' && VALID_QUALITIES.includes(o.cameraQuality as CameraQuality))
    out.cameraQuality = o.cameraQuality as CameraQuality
  if (typeof o.backgroundBlurEnabled === 'boolean') out.backgroundBlurEnabled = o.backgroundBlurEnabled
  if (typeof o.noiseReductionMode === 'string' && VALID_NOISE.includes(o.noiseReductionMode as NoiseReductionMode))
    out.noiseReductionMode = o.noiseReductionMode as NoiseReductionMode
  if (typeof o.captureNoiseSuppression === 'boolean') out.captureNoiseSuppression = o.captureNoiseSuppression
  if (typeof o.captureAutoGainControl === 'boolean') out.captureAutoGainControl = o.captureAutoGainControl
  if (typeof o.captureEchoCancellation === 'boolean') out.captureEchoCancellation = o.captureEchoCancellation
  if (typeof o.micMode === 'string' && VALID_MIC.includes(o.micMode as MicMode)) out.micMode = o.micMode as MicMode
  if (o.pttBinding && typeof o.pttBinding === 'object') {
    const b = o.pttBinding as Record<string, unknown>
    if (b.type === 'key' && typeof b.key === 'string') out.pttBinding = { type: 'key', key: b.key }
    else if (b.type === 'mouse' && typeof b.button === 'number')
      out.pttBinding = { type: 'mouse', button: b.button }
  }
  if (typeof o.vadThreshold === 'number' && Number.isFinite(o.vadThreshold)) out.vadThreshold = o.vadThreshold
  if (typeof o.vadMode === 'string' && VALID_VAD.includes(o.vadMode as VadMode)) out.vadMode = o.vadMode as VadMode
  if (typeof o.notifEnabled === 'boolean') out.notifEnabled = o.notifEnabled
  if (typeof o.notifSoundEnabled === 'boolean') out.notifSoundEnabled = o.notifSoundEnabled
  if (typeof o.screenShareResolution === 'string' && VALID_SS_RES.includes(o.screenShareResolution as ScreenShareResolution))
    out.screenShareResolution = o.screenShareResolution as ScreenShareResolution
  if (typeof o.screenShareFps === 'number' && VALID_SS_FPS.includes(o.screenShareFps as ScreenShareFps))
    out.screenShareFps = o.screenShareFps as ScreenShareFps
  if (o.serverUrl === null || typeof o.serverUrl === 'string') out.serverUrl = o.serverUrl
  if (o.pwaInstallDismissedAt === null || typeof o.pwaInstallDismissedAt === 'number')
    out.pwaInstallDismissedAt = o.pwaInstallDismissedAt

  return out
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaults,

      setAccent: (preset) => {
        applyAccentPreset(preset)
        set({ accent: preset })
      },

      setMemberSidebarVisible: (v) => set({ memberSidebarVisible: v }),

      toggleMemberSidebarVisible: () => set((s) => ({ memberSidebarVisible: !s.memberSidebarVisible })),

      setChannelSidebarWidth: (w) => set({ channelSidebarWidth: clampChannelWidth(w) }),

      toggleCollapsedCategory: (categoryId) =>
        set((s) => {
          const has = s.collapsedCategoryIds.includes(categoryId)
          return {
            collapsedCategoryIds: has
              ? s.collapsedCategoryIds.filter((id) => id !== categoryId)
              : [...s.collapsedCategoryIds, categoryId]
          }
        }),

      isCategoryCollapsed: (categoryId) => get().collapsedCategoryIds.includes(categoryId),

      setAudioInputDeviceId: (id) => set({ audioInputDeviceId: id }),
      setAudioOutputDeviceId: (id) => set({ audioOutputDeviceId: id }),
      setCameraDeviceId: (id) => set({ cameraDeviceId: id }),
      setCameraQuality: (q) =>
        set({ cameraQuality: VALID_QUALITIES.includes(q) ? q : defaults.cameraQuality }),
      setBackgroundBlurEnabled: (v) => set({ backgroundBlurEnabled: v }),

      setNoiseReductionMode: (mode) =>
        set({ noiseReductionMode: VALID_NOISE.includes(mode) ? mode : defaults.noiseReductionMode }),
      setCaptureNoiseSuppression: (on) => set({ captureNoiseSuppression: on }),
      setCaptureAutoGainControl: (on) => set({ captureAutoGainControl: on }),
      setCaptureEchoCancellation: (on) => set({ captureEchoCancellation: on }),

      setMicMode: (mode) => set({ micMode: VALID_MIC.includes(mode) ? mode : defaults.micMode }),
      setPttBinding: (b) => set({ pttBinding: b }),
      setVadThreshold: (n) =>
        set({ vadThreshold: Number.isFinite(n) ? n : defaults.vadThreshold }),
      setVadMode: (mode) => set({ vadMode: VALID_VAD.includes(mode) ? mode : defaults.vadMode }),

      setNotifEnabled: (v) => set({ notifEnabled: v }),
      setNotifSoundEnabled: (v) => set({ notifSoundEnabled: v }),
      patchNotifSettings: (p) =>
        set((s) => ({
          notifEnabled: p.enabled ?? s.notifEnabled,
          notifSoundEnabled: p.soundEnabled ?? s.notifSoundEnabled
        })),

      setScreenShareResolution: (r) =>
        set({
          screenShareResolution: VALID_SS_RES.includes(r) ? r : defaults.screenShareResolution
        }),
      setScreenShareFps: (f) =>
        set({ screenShareFps: VALID_SS_FPS.includes(f) ? f : defaults.screenShareFps }),

      setServerUrl: (url) => {
        set({ serverUrl: url })
        if (url) void electronAPI?.setServerUrl(url).catch(() => {})
      },

      clearServerUrl: () => {
        set({ serverUrl: null })
        void electronAPI?.setServerUrl('').catch(() => {})
      },

      setPwaInstallDismissedAt: (ts) => set({ pwaInstallDismissedAt: ts })
    }),
    {
      name: 'jablu-settings',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => ({
        ...current,
        ...coercePersisted(persisted)
      }),
      partialize: (s) => ({
        accent: s.accent,
        memberSidebarVisible: s.memberSidebarVisible,
        channelSidebarWidth: s.channelSidebarWidth,
        collapsedCategoryIds: s.collapsedCategoryIds,
        audioInputDeviceId: s.audioInputDeviceId,
        audioOutputDeviceId: s.audioOutputDeviceId,
        cameraDeviceId: s.cameraDeviceId,
        cameraQuality: s.cameraQuality,
        backgroundBlurEnabled: s.backgroundBlurEnabled,
        noiseReductionMode: s.noiseReductionMode,
        captureNoiseSuppression: s.captureNoiseSuppression,
        captureAutoGainControl: s.captureAutoGainControl,
        captureEchoCancellation: s.captureEchoCancellation,
        micMode: s.micMode,
        pttBinding: s.pttBinding,
        vadThreshold: s.vadThreshold,
        vadMode: s.vadMode,
        notifEnabled: s.notifEnabled,
        notifSoundEnabled: s.notifSoundEnabled,
        screenShareResolution: s.screenShareResolution,
        screenShareFps: s.screenShareFps,
        serverUrl: s.serverUrl,
        pwaInstallDismissedAt: s.pwaInstallDismissedAt
      })
    }
  )
)

useSettingsStore.persist.onFinishHydration(() => {
  const { accent } = useSettingsStore.getState()
  applyAccentPreset(accent)
})

if (useSettingsStore.persist.hasHydrated()) {
  applyAccentPreset(useSettingsStore.getState().accent)
}

export function getStoredServerUrl(): string | null {
  return useSettingsStore.getState().serverUrl
}

export function setStoredServerUrl(url: string) {
  useSettingsStore.getState().setServerUrl(url)
}

export function clearServerUrl() {
  useSettingsStore.getState().clearServerUrl()
}
