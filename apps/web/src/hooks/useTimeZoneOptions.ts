import { useMemo } from 'react'
export function useTimeZoneOptions(): string[] {
  return useMemo(() => {
    try {
      const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
      return fn ? fn.call(Intl, 'timeZone') : ['UTC']
    } catch {
      return ['UTC']
    }
  }, [])
}
