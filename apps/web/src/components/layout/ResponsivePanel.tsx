import type { ReactNode } from 'react'
import { MobileDrawer } from './MobileDrawer'
import { PanelResizeHandle } from './PanelResizeHandle'
import { PANEL_LIMITS, useSettingsStore } from '@/stores/settings.store'
import { useTranslation } from 'react-i18next'

export function ResponsivePanel({
  overlay,
  onClose,
  children,
  maxWidth = PANEL_LIMITS.secondary.max
}: {
  overlay: boolean
  onClose: () => void
  children: ReactNode
  maxWidth?: number
}) {
  const { t } = useTranslation('nav')
  const preferredWidth = useSettingsStore((s) => s.panelWidths.secondary)
  const setWidth = useSettingsStore((s) => s.setPanelWidth)
  const limits = PANEL_LIMITS.secondary
  const max = Math.max(limits.min, Math.min(limits.max, maxWidth))
  const width = Math.min(preferredWidth, max)
  return overlay ? (
    <MobileDrawer open onClose={onClose} side="right" width="w-[min(100vw,30rem)]">
      {children}
    </MobileDrawer>
  ) : (
    <div className="relative flex h-full min-h-0 shrink-0" style={{ width }}>
      <PanelResizeHandle
        label={t('resizeConversationPanel')}
        value={width}
        min={limits.min}
        max={max}
        edge="left"
        onChange={(value) => setWidth('secondary', value)}
        onReset={() => setWidth('secondary', limits.default)}
      />
      {children}
    </div>
  )
}
