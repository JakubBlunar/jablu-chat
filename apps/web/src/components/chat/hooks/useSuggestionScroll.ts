import { useEffect, useRef } from 'react'

export function useSuggestionScroll(selectedIndex: number, itemCount: number) {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const selected = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    selected?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex, itemCount])
  return listRef
}
