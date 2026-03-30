import { useNavigate } from 'react-router-dom'
import { useToastStore } from '@/stores/toast.store'

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)
  const navigate = useNavigate()

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-2" aria-live="polite" role="log">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          onClick={() => {
            if (toast.url) navigate(toast.url)
            removeToast(toast.id)
          }}
          className="animate-toast-in pointer-events-auto w-80 cursor-pointer rounded-lg border border-border bg-surface-overlay p-3 shadow-lg transition-opacity hover:opacity-90"
        >
          <div className="truncate text-sm font-semibold text-white">{toast.title}</div>
          <div className="mt-0.5 truncate text-xs text-muted">{toast.body}</div>
        </div>
      ))}
    </div>
  )
}
