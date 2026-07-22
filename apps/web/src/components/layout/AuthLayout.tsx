import type { ReactNode } from 'react'

type AuthLayoutProps = {
  children: ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    // The app disables body scrolling globally (`body { position: fixed }`), so this
    // must be its own scroll container. The inner wrapper uses `min-h-full` + flex
    // centering so the card is centered when it fits and fully scrollable (button
    // reachable) when the form is taller than the viewport / the keyboard is open.
    <div
      className="h-full overflow-y-auto bg-auth-bg"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
    >
      <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
        <div className="mb-8 flex flex-col items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="Jablu" className="h-14 w-14 mb-4 rounded-2xl shadow-lg shadow-primary/25" />
          <h1 className="text-2xl font-semibold tracking-tight text-white">Jablu</h1>
          <p className="text-sm text-gray-400">Your corner of the internet</p>
        </div>

        <div className="w-full max-w-[420px] rounded-xl border border-white/10 bg-surface-dark p-8 shadow-xl shadow-black/40">
          {children}
        </div>
      </div>
    </div>
  )
}
