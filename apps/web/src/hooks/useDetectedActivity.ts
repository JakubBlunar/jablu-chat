import { useEffect, useRef } from 'react'
import type { Socket } from 'socket.io-client'
import type { DetectedActivity, UserActivity } from '@chat/shared'
import { api } from '@/lib/api'
import { desktopAPI, isDesktop } from '@/lib/desktop'
import { useActivityStore } from '@/stores/activity.store'

/** Build a stable signature so we only re-emit when the shared activity changes. */
function signature(a: UserActivity | null): string {
  if (!a) return ''
  return `${a.kind}|${a.name}|${a.details ?? ''}|${a.state ?? ''}`
}

/**
 * Desktop-only: listens to natively detected activities, applies the user's
 * privacy filters (master toggle, per-category toggles, hidden games), resolves
 * icons, auto-registers games, and broadcasts the current activity over the
 * socket. No-op on web / mobile.
 */
export function useDetectedActivity(socket: Socket | null) {
  const lastSig = useRef('')
  const lastStartedAt = useRef<string>('')
  const iconCache = useRef<Map<string, string>>(new Map())
  const registeredNames = useRef<Set<string>>(new Set())

  const shareEnabled = useActivityStore((s) => s.settings?.shareEnabled ?? false)
  const shareGames = useActivityStore((s) => s.settings?.shareGames ?? true)
  const shareMusic = useActivityStore((s) => s.settings?.shareMusic ?? true)

  const games = useActivityStore((s) => s.games)

  // Load own settings + registered games once on desktop.
  useEffect(() => {
    if (!isDesktop) return
    void useActivityStore.getState().fetchSettings().catch(() => {})
    void useActivityStore.getState().fetchGames().catch(() => {})
  }, [])

  // Teach the native detector about the user's registered executables so custom
  // apps/games added under "Registered Games" become detectable.
  useEffect(() => {
    if (!isDesktop || !desktopAPI) return
    const detectables = games
      .filter((g) => g.executable && g.executable.trim())
      .map((g) => ({
        name: g.name,
        executables: g
          .executable!.split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
      }))
      .filter((d) => d.executables.length > 0)
    void desktopAPI.setCustomDetectables(detectables).catch(() => {})
  }, [games])

  // Toggle native detection with the master switch.
  useEffect(() => {
    if (!isDesktop || !desktopAPI) return
    void desktopAPI.setActivityDetectionEnabled(shareEnabled).catch(() => {})
    if (!shareEnabled && socket?.connected) {
      lastSig.current = ''
      socket.emit('activity:clear')
    }
  }, [shareEnabled, socket])

  useEffect(() => {
    if (!isDesktop || !desktopAPI || !socket) return

    let cancelled = false

    const resolveIcon = async (d: DetectedActivity): Promise<string | null> => {
      if (d.iconUrl) return d.iconUrl
      if (!d.iconDataUrl) return null
      const key = (d.executable || d.appId || d.name).toLowerCase()
      const cached = iconCache.current.get(key)
      if (cached) return cached
      try {
        const { url } = await api.uploadActivityIcon(d.iconDataUrl, key)
        iconCache.current.set(key, url)
        return url
      } catch {
        return null
      }
    }

    const pickPrimary = (list: DetectedActivity[]): DetectedActivity | null => {
      const hidden = new Set(
        useActivityStore
          .getState()
          .games.filter((g) => g.hidden)
          .map((g) => g.name.toLowerCase())
      )
      const eligible = list.filter((d) => {
        if (d.kind === 'game' && !shareGames) return false
        if (d.kind === 'music' && !shareMusic) return false
        if (d.kind === 'game' && hidden.has(d.name.toLowerCase())) return false
        return true
      })
      // Games take precedence over music, matching Discord's primary activity.
      return eligible.find((d) => d.kind === 'game') ?? eligible.find((d) => d.kind === 'music') ?? null
    }

    const handle = async (list: DetectedActivity[]) => {
      if (!shareEnabled || !socket.connected) return
      const primary = pickPrimary(list)

      if (!primary) {
        if (lastSig.current !== '') {
          lastSig.current = ''
          socket.emit('activity:clear')
        }
        return
      }

      const base: UserActivity = {
        kind: primary.kind,
        name: primary.name,
        details: primary.details ?? null,
        state: primary.state ?? null,
        iconUrl: null,
        startedAt: new Date(primary.startedAt).toISOString()
      }
      const sig = signature(base)
      const alreadyEmitted = sig === lastSig.current

      // Resolve the icon once (cached) so both the registered-games entry and the
      // broadcast use the same stored, square icon.
      const iconUrl = await resolveIcon(primary)
      if (cancelled) return

      // Auto-register games so they appear in "Added Games".
      if (primary.kind === 'game' && !registeredNames.current.has(primary.name.toLowerCase())) {
        registeredNames.current.add(primary.name.toLowerCase())
        void api
          .upsertRegisteredGame({
            name: primary.name,
            source: primary.source,
            executable: primary.executable ?? null,
            steamAppId: primary.appId ?? null,
            iconUrl: iconUrl ?? primary.iconUrl ?? null
          })
          .then((game) => useActivityStore.getState().upsertGameLocal(game))
          .catch(() => registeredNames.current.delete(primary.name.toLowerCase()))
      }

      if (alreadyEmitted) return

      // Keep startedAt stable for the same activity across ticks.
      lastStartedAt.current = base.startedAt
      lastSig.current = sig
      socket.emit('activity:update', { ...base, iconUrl, startedAt: lastStartedAt.current })
    }

    const off = desktopAPI.onActivityDetected((list) => {
      void handle(list)
    })

    // Prime once in case an activity is already running at mount.
    void desktopAPI.getDetectedActivities().then((list) => {
      if (!cancelled && list.length > 0) void handle(list)
    })

    return () => {
      cancelled = true
      off()
    }
  }, [socket, shareEnabled, shareGames, shareMusic])
}
