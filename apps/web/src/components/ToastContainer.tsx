import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useToastStore } from '@/stores/toast.store'

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)
  const navigate = useNavigate()

  if (toasts.length === 0) return null

  return createPortal(
    <div className="pointer-events-none fixed right-4 top-12 z-[10000] flex max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite" role="log">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          onClick={() => {
            if (toast.url) navigate(toast.url)
            removeToast(toast.id)
          }}
          style={{ backgroundColor: 'var(--color-surface-overlay, #121318)' }}
          className="animate-toast-in pointer-events-auto w-80 max-w-full cursor-pointer rounded-lg border border-white/15 p-3 shadow-lg"
        >
          <div className="truncate text-sm font-semibold text-white">{toast.title}</div>
          <div className="mt-0.5 break-words text-xs text-gray-300">{toast.body}</div>
        </div>
      ))}
    </div>,
    document.body
  )
}
