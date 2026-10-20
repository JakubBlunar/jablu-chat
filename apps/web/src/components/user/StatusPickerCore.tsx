import type { StatusDurationPreset, UserStatus } from '@chat/shared'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StatusDot } from '@/components/ui/StatusDot'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { STATUS_DURATION_OPTIONS, STATUS_OPTIONS } from '@/components/settings/settingsTypes'
import { useAuthStore } from '@/stores/auth.store'
import { useIsMobile } from '@/hooks/useMobile'
import { manualPresenceSubtitle, statusDisplayLabel } from '@/lib/manual-status-display'

function ChevronRight() {
  return (
    <svg className="h-4 w-4 shrink-0 text-gray-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
    </svg>
  )
}

/** Duration menu beside a row (settings + footer). */
function placeDurationFlyout(rect: DOMRect, menuW: number, menuH: number) {
  const pad = 8
  let left = rect.right + pad
  let top = rect.top
  if (left + menuW > window.innerWidth - pad) {
    left = rect.left - menuW - pad
  }
  if (left < pad) left = pad
  if (top + menuH > window.innerHeight - pad) {
    top = Math.max(pad, window.innerHeight - menuH - pad)
  }
  return { left, top }
}

export type StatusPickerCoreProps = {
  variant?: 'default' | 'compact'
  /** Called after a status update succeeds (e.g. close footer popover). */
  onRequestClose?: () => void
  /** Optional link row (e.g. open full settings → status tab). */
  onEditFullSettings?: () => void
  className?: string
}

export function StatusPickerCore({
  variant = 'default',
  onRequestClose,
  onEditFullSettings,
  className = ''
}: StatusPickerCoreProps) {
  const { t, i18n } = useTranslation('settings')
  const user = useAuthStore((s) => s.user)
  const updateStatus = useAuthStore((s) => s.updateStatus)
  const [loading, setLoading] = useState<UserStatus | null>(null)
  const isMobile = useIsMobile()
  const [flyout, setFlyout] = useState<{ status: UserStatus; left: number; top: number } | null>(null)
  const [mobileDurationFor, setMobileDurationFor] = useState<UserStatus | null>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)

  const currentStatus = user?.status ?? 'online'
  const locale = i18n.resolvedLanguage ?? i18n.language
  const manualHint = user ? manualPresenceSubtitle(user, t, locale) : null
  const compact = variant === 'compact'

  useEffect(() => {
    if (!flyout) return
    const close = (e: MouseEvent) => {
      const t = e.target as Node
      if (flyoutRef.current?.contains(t)) return
      setFlyout(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [flyout])

  useEffect(() => {
    if (!flyout) return
    const onResize = () => setFlyout(null)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [flyout])

  const finish = () => {
    onRequestClose?.()
  }

  const applyOnline = async () => {
    setFlyout(null)
    setMobileDurationFor(null)
    setLoading('online')
    try {
      await updateStatus('online')
      finish()
    } catch {
      /* ignore */
    } finally {
      setLoading(null)
    }
  }

  const applyWithDuration = async (status: UserStatus, duration: StatusDurationPreset) => {
    setFlyout(null)
    setMobileDurationFor(null)
    setLoading(status)
    try {
      await updateStatus(status, duration)
      finish()
    } catch {
      /* ignore */
    } finally {
      setLoading(null)
    }
  }

  const onStatusRowClick = (opt: (typeof STATUS_OPTIONS)[number], el: HTMLElement) => {
    if (!opt.pickDuration) {
      void applyOnline()
      return
    }
    if (isMobile) {
      setFlyout(null)
      setMobileDurationFor(opt.value)
      return
    }
    const rect = el.getBoundingClientRect()
    if (flyout?.status === opt.value) {
      setFlyout(null)
      return
    }
    const pos = placeDurationFlyout(rect, 220, 320)
    setFlyout({ status: opt.value, left: pos.left, top: pos.top })
  }

  const rowPad = compact ? 'px-2 py-2' : 'px-3 py-3'
  const showSubtitles = !compact

  return (
    <div className={className} data-status-picker="root">
      {!compact ? (
        <>
          <p className="text-sm text-gray-400">{t('status.presenceIntro')}</p>
          {manualHint && user?.manualStatus ? (
            <p className="mt-2 rounded-lg border border-white/10 bg-surface-darkest/80 px-3 py-2 text-sm text-gray-200">
              <span className="font-medium text-white">{statusDisplayLabel(user.manualStatus, t)}</span>
              <span className="text-gray-500"> · </span>
              <span className="text-gray-400">{manualHint}</span>
            </p>
          ) : null}
        </>
      ) : manualHint && user?.manualStatus ? (
        <p className="mb-2 rounded-md border border-white/10 bg-surface-darkest/60 px-2 py-1.5 text-xs text-gray-300">
          <span className="font-medium text-white">{statusDisplayLabel(user.manualStatus, t)}</span>
          <span className="text-gray-500"> · </span>
          <span>{manualHint}</span>
        </p>
      ) : null}

      <div className={compact ? 'mt-0 space-y-0.5' : 'mt-3 space-y-1'}>
        {STATUS_OPTIONS.map((opt) => {
          const active = currentStatus === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              disabled={loading !== null}
              onClick={(e) => onStatusRowClick(opt, e.currentTarget)}
              className={`flex w-full items-start gap-2 rounded-lg text-left transition ${rowPad} ${
                active ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <StatusDot status={opt.value} size="md" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{t(opt.labelKey)}</span>
                  {opt.pickDuration ? <ChevronRight /> : null}
                </div>
                {showSubtitles && opt.subtitleKey ? (
                  <span className="mt-0.5 block text-xs text-gray-500">{t(opt.subtitleKey)}</span>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                {active ? <span className="text-xs text-gray-400">{t('status.current')}</span> : null}
                {loading === opt.value ? <span className="text-xs text-gray-400">...</span> : null}
              </div>
            </button>
          )
        })}
      </div>

      {onEditFullSettings ? (
        <button
          type="button"
          className={`mt-2 w-full rounded-lg text-left text-xs text-primary transition hover:text-primary-hover ${compact ? 'px-2 py-2' : 'px-3 py-2'}`}
          onClick={() => {
            onEditFullSettings()
            onRequestClose?.()
          }}
        >
          {t('status.customMore')}
        </button>
      ) : null}

      {flyout && !isMobile ? (
        <div
          ref={flyoutRef}
          data-status-picker="flyout"
          className="fixed z-[260] w-[220px] rounded-lg border border-white/10 bg-surface-dark py-1 shadow-2xl ring-1 ring-black/20"
          style={{ left: flyout.left, top: flyout.top }}
          role="menu"
        >
          <p className="border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('status.clearAfter')}
          </p>
          {STATUS_DURATION_OPTIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              role="menuitem"
              className="w-full px-3 py-2.5 text-left text-sm text-gray-200 transition hover:bg-white/10"
              onClick={() => void applyWithDuration(flyout.status, d.value)}
            >
              {t(d.labelKey)}
            </button>
          ))}
        </div>
      ) : null}

      {mobileDurationFor ? (
        <ModalOverlay onClose={() => setMobileDurationFor(null)} maxWidth="max-w-sm" zIndex="z-[270]">
          <div data-status-picker="duration-modal">
            <h2 className="text-lg font-semibold text-white">{statusDisplayLabel(mobileDurationFor, t)}</h2>
            <p className="mt-1 text-sm text-gray-400">{t('status.durationQuestion')}</p>
            <div className="mt-4 space-y-1">
              {STATUS_DURATION_OPTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  className="w-full rounded-lg px-3 py-3 text-left text-sm text-gray-200 transition hover:bg-white/10"
                  onClick={() => void applyWithDuration(mobileDurationFor, d.value)}
                >
                  {t(d.labelKey)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mt-4 text-sm text-gray-400 transition hover:text-white"
              onClick={() => setMobileDurationFor(null)}
            >
              {t('status.cancel')}
            </button>
          </div>
        </ModalOverlay>
      ) : null}
    </div>
  )
}
