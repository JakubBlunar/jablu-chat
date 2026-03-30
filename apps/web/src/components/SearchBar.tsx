import { useEffect, useRef, useState } from 'react'
import { useIsMobile } from '@/hooks/useMobile'
import { IconButton } from '@/components/ui'

type Props = {
  searchOpen: boolean
  query: string
  onQueryChange: (q: string) => void
  onSearch: (q: string) => void
  onClose: () => void
}

export function SearchBar({ searchOpen, query, onQueryChange, onSearch, onClose }: Props) {
  const isMobile = useIsMobile()
  const [local, setLocal] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!searchOpen) setLocal('')
  }, [searchOpen])

  useEffect(() => {
    if (searchOpen) setLocal(query)
  }, [searchOpen, query])

  function handleChange(value: string) {
    setLocal(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (value.trim()) {
      timerRef.current = setTimeout(() => {
        onQueryChange(value)
        onSearch(value)
      }, 500)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && local.trim()) {
      if (timerRef.current) clearTimeout(timerRef.current)
      onQueryChange(local)
      onSearch(local)
    }
    if (e.key === 'Escape' && searchOpen) {
      onClose()
    }
  }

  if (isMobile) {
    return searchOpen ? (
      <IconButton label="Close search" variant="ghost" className="text-white hover:text-white" onClick={onClose}>
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M6 18L18 6M6 6l12 12" />
        </svg>
      </IconButton>
    ) : (
      <IconButton label="Search" variant="ghost" onClick={() => onSearch('')}>
        <SearchIcon />
      </IconButton>
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center rounded bg-surface-darkest px-2">
        <SearchIcon />
        <input
          ref={inputRef}
          type="text"
          value={searchOpen ? query : local}
          readOnly={searchOpen}
          onChange={(e) => !searchOpen && handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (searchOpen) inputRef.current?.blur()
          }}
          placeholder="Search..."
          className={`w-32 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-gray-500 md:w-44 ${
            searchOpen ? 'text-gray-500 cursor-default' : 'text-gray-200'
          }`}
        />
        {searchOpen && (
          <IconButton label="Close search" variant="ghost" size="sm" className="ml-1" onClick={onClose}>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </IconButton>
        )}
      </div>
    </div>
  )
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}
