import { useEffect, useRef } from 'react'
import type { Socket } from 'socket.io-client'
import type { DetectedActivity, ActivitySnapshot, UserActivity } from '@chat/shared'
import { api } from '@/lib/api'
import { desktopAPI, isDesktop } from '@/lib/desktop'
import { useActivityStore } from '@/stores/activity.store'
import { useAuthStore } from '@/stores/auth.store'

const FRESH_MS = 20_000
const RENEW_MS = 20_000
const identity = (a: DetectedActivity) =>
  `${a.source}|${a.appId ?? a.executable ?? a.name}|${a.sessionId ?? a.startedAt}|${a.details ?? ''}|${a.state ?? ''}`
const hash = (value: string) => {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619)
  return (h >>> 0).toString(16)
}

/** Publish renewable native observations. Artwork never blocks activity liveness. */
export function useDetectedActivity(socket: Socket | null) {
  const userId = useAuthStore((s) => s.user?.id)
  const sequence = useRef(0)

  useEffect(() => {
    const native = desktopAPI
    if (!isDesktop || !native || !socket || !userId) return
    let cancelled = false
    let ready = false
    let loading = false
    let latest: ActivitySnapshot | null = null
    let selected: string | null = null
    let lastSent: string | undefined
    let lastSentAt = 0
    let attempt = 0
    let ackTimer: ReturnType<typeof setTimeout> | undefined
    let pollRequest = 0
    const icons = new Map<string, string>()
    const uploading = new Set<string>()
    const registered = new Set<string>()
    const current = () => !cancelled && useAuthStore.getState().user?.id === userId
    const fresh = () =>
      latest !== null && Date.now() - latest.observedAt <= FRESH_MS && latest.observedAt <= Date.now() + 5000

    const send = (force = false) => {
      if (!current() || !socket.connected) return
      const store = useActivityStore.getState()
      const hidden = store.games.filter((g) => g.hidden)
      const eligible =
        ready && store.settingsLoaded && store.gamesLoaded && store.settings?.shareEnabled && fresh()
          ? latest!.activities
              .filter(
                (a) =>
                  (a.kind === 'game' ? store.settings!.shareGames : store.settings!.shareMusic) &&
                  (a.kind !== 'game' ||
                    !hidden.some(
                      (g) =>
                        g.name.toLowerCase() === a.name.toLowerCase() ||
                        (!!a.appId && g.steamAppId === a.appId) ||
                        (!!a.executable &&
                          g.executable
                            ?.split(',')
                            .some((exe) => exe.trim().toLowerCase() === a.executable!.toLowerCase()))
                    ))
              )
              .sort(
                (a, b) => (a.kind === b.kind ? 0 : a.kind === 'game' ? -1 : 1) || identity(a).localeCompare(identity(b))
              )
          : []
      const primary =
        eligible.find(
          (a) => identity(a) === selected && (a.kind === 'game' || !eligible.some((d) => d.kind === 'game'))
        ) ?? eligible[0]
      selected = primary ? identity(primary) : null
      const artKey = primary?.iconDataUrl ? hash(primary.iconDataUrl) : ''
      const iconUrl = primary?.iconUrl ?? icons.get(artKey) ?? null
      const activity: (UserActivity & { appId?: string | null; executable?: string | null }) | null = primary
        ? {
            kind: primary.kind,
            name: primary.name,
            details: primary.details ?? null,
            state: primary.state ?? null,
            iconUrl,
            startedAt: new Date(primary.startedAt).toISOString(),
            appId: primary.appId,
            executable: primary.executable
          }
        : null
      const sig = JSON.stringify(activity)
      if (force || lastSent !== sig || (activity && Date.now() - lastSentAt >= RENEW_MS)) {
        clearTimeout(ackTimer)
        lastSent = sig
        lastSentAt = Date.now()
        const thisAttempt = ++attempt
        const retry = () => {
          if (!current() || thisAttempt !== attempt) return
          lastSent = undefined
          ackTimer = setTimeout(() => send(), 2000)
        }
        ackTimer = setTimeout(retry, 5000)
        socket.emit(
          activity ? 'activity:update' : 'activity:clear',
          { ...(activity ?? {}), sequence: ++sequence.current },
          (reply: { ok?: boolean } | undefined) => {
            if (!current() || thisAttempt !== attempt) return
            clearTimeout(ackTimer)
            if (!reply?.ok) retry()
          }
        )
      }
      if (!primary) return
      const sessionKey = identity(primary)
      if (primary.kind === 'game' && !registered.has(sessionKey)) {
        registered.add(sessionKey)
        void api
          .upsertRegisteredGame({
            name: primary.name,
            source: primary.source,
            executable: primary.executable ?? null,
            steamAppId: primary.appId ?? null,
            iconUrl
          })
          .then((game) => {
            if (current()) {
              const existing = useActivityStore.getState().games.find((g) => g.id === game.id)
              useActivityStore
                .getState()
                .upsertGameLocal(existing ? { ...game, name: existing.name, hidden: existing.hidden } : game)
            }
          })
          .catch(() => registered.delete(sessionKey))
      }
      if (primary.iconDataUrl && !icons.has(artKey) && !uploading.has(artKey)) {
        uploading.add(artKey)
        void api
          .uploadActivityIcon(primary.iconDataUrl, `activity-${artKey}`)
          .then(({ url }) => {
            if (!current()) return
            icons.set(artKey, url)
            if (icons.size > 128) icons.delete(icons.keys().next().value!)
            send() // Re-derive current privacy/selection; never publish the captured game.
          })
          .catch(() => {})
          .finally(() => uploading.delete(artKey))
      }
    }

    const receive = (snapshot: ActivitySnapshot) => {
      if (!current() || (latest && snapshot.generation < latest.generation)) return
      latest = snapshot
      send()
    }
    const read = () => {
      const request = ++pollRequest
      void native
        .getActivitySnapshot()
        .then((snapshot) => {
          if (current() && request === pollRequest) receive(snapshot)
        })
        .catch(() => {})
    }
    const load = () => {
      if (loading) return
      loading = true
      const store = useActivityStore.getState()
      void Promise.all([store.fetchSettings(), store.fetchGames()])
        .then(() => {
          if (current()) {
            ready = true
            configure()
            read()
          }
        })
        .catch(() => {})
        .finally(() => {
          loading = false
        })
    }
    const configure = () => {
      if (!current()) return
      const store = useActivityStore.getState()
      void native
        .setActivityDetectionEnabled(
          ready && store.settingsLoaded && store.gamesLoaded && !!store.settings?.shareEnabled
        )
        .catch(() => {})
      const detectables = store.games
        .filter((g) => g.executable?.trim())
        .map((g) => ({
          name: g.name,
          appId: g.steamAppId,
          executables: g
            .executable!.split(',')
            .map((exe) => exe.trim().toLowerCase())
            .filter(Boolean)
        }))
      void native.setCustomDetectables(detectables).catch(() => {})
      send()
    }
    const onConnect = () => {
      lastSent = undefined
      read()
      send()
    }
    const onDisconnect = () => {
      ++attempt
      clearTimeout(ackTimer)
      lastSent = undefined
      latest = null
      ++pollRequest
    }
    const onResume = () => {
      if (!document.hidden) read()
    }
    const off = native.onActivitySnapshot(receive)
    const offWindow = native.onWindowState((state) => {
      if (state.visible && !state.minimized) read()
    })
    const unsubscribe = useActivityStore.subscribe((state, previous) => {
      if (state.settings !== previous.settings || state.games !== previous.games) configure()
    })
    socket.on('connect', onConnect)
    socket.on('activity:preferences-changed', onConnect)
    socket.on('disconnect', onDisconnect)
    document.addEventListener('visibilitychange', onResume)
    const timer = setInterval(() => {
      if (!ready) load()
      send()
    }, 5000)
    load()
    read()
    return () => {
      cancelled = true
      ++attempt
      clearTimeout(ackTimer)
      clearInterval(timer)
      off()
      offWindow()
      unsubscribe()
      socket.off('connect', onConnect)
      socket.off('activity:preferences-changed', onConnect)
      socket.off('disconnect', onDisconnect)
      document.removeEventListener('visibilitychange', onResume)
      void native.setActivityDetectionEnabled(false).catch(() => {})
      void native.setCustomDetectables([]).catch(() => {})
    }
  }, [socket, userId])
}
