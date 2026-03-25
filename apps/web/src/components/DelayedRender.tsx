import { useEffect, useState, type ReactNode } from 'react'

export function DelayedRender({
  loading,
  delay = 300,
  fallback,
  children
}: {
  loading: boolean
  delay?: number
  fallback?: ReactNode
  children: ReactNode
}) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!loading) {
      setShow(false)
      return
    }
    const timer = setTimeout(() => setShow(true), delay)
    return () => clearTimeout(timer)
  }, [loading, delay])

  if (!loading) return null
  if (!show) return fallback ?? null
  return <>{children}</>
}
