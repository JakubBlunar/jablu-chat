import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchReturn } from '@/stores/searchReturn.store'
import { MobileDrawer } from '@/components/layout/MobileDrawer'
const Drawer = lazy(() => import('./SearchDrawer').then((m) => ({ default: m.SearchDrawer })))

export function SearchReturnBar() {
  const { t } = useTranslation('search')
  const saved = useSearchReturn((s) => s.saved)
  const open = useSearchReturn((s) => s.open)
  const [query, setQuery] = useState('')
  if (!saved) return null
  const close = () => useSearchReturn.setState({ saved: null, open: false })
  return (
    <>
      <div className="flex shrink-0 items-center bg-surface-dark px-2 text-sm">
        <button
          className="min-h-11 flex-1 truncate text-left"
          onClick={() => {
            setQuery(saved.query)
            useSearchReturn.setState({ open: true })
          }}
        >
          {t('backToResults')} · {saved.query}
        </button>
        <button className="h-11 w-11" aria-label={t('closeSearch')} onClick={close}>
          ×
        </button>
      </div>
      {open && (
        <MobileDrawer open side="right" width="w-full" onClose={close}>
          <Suspense fallback={null}>
            <Drawer
              query={query}
              onQueryChange={setQuery}
              resume={saved}
              defaultScope={saved.conversationId ? 'conversation' : 'server'}
              conversationId={saved.conversationId}
              onClose={() => {
                if (useSearchReturn.getState().open) close()
              }}
            />
          </Suspense>
        </MobileDrawer>
      )}
    </>
  )
}
