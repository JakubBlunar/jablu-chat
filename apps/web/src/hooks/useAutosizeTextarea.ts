import { useCallback, useEffect, type RefObject } from 'react'

export function useAutosizeTextarea(ref: RefObject<HTMLTextAreaElement | null>, value: string, min = 44, max = 240) {
  const resize = useCallback(() => {
    const element = ref.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = Math.max(min, Math.min(element.scrollHeight, max)) + 'px'
  }, [ref, min, max])
  useEffect(() => {
    resize()
  }, [value, resize])
  return resize
}
