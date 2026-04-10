import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { api, type GifResult } from '@/lib/api'
import { useIsMobile } from '@/hooks/useMobile'

interface GifPickerProps {
  onSelect: (gifUrl: string) => void
  onClose: () => void
}

export function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const { t } = useTranslation('chat')
  const { t: tSearch } = useTranslation('search')
  const { t: tCommon } = useTranslation('common')
  const isMobile = useIsMobile()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isMobile) return
    function handleClick(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('pointerdown', handleClick)
    return () => document.removeEventListener('pointerdown', handleClick)
  }, [onClose, isMobile])

  const content = (
    <GifPickerContent onSelect={onSelect} onClose={onClose} searchPlaceholder={tSearch('searchGiphyPlaceholder')} />
  )

  if (isMobile) {
    return createPortal(
      <ModalOverlay onClose={onClose} zIndex="z-[110]" maxWidth="max-w-sm" noPadding className="flex max-h-[80vh] flex-col overflow-hidden">
        <div ref={ref} className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
            <span className="text-sm font-semibold text-white">{t('gifPickerSheetTitle')}</span>
            <button
              type="button"
              aria-label={tCommon('close')}
              onClick={onClose}
              className="rounded-full p-1 text-gray-400 hover:bg-white/10 hover:text-white"
            >
              <XIcon />
            </button>
          </div>
          {content}
        </div>
      </ModalOverlay>,
      document.body
    )
  }

  return (
    <div
      ref={ref}
      className="z-50 flex max-h-[420px] w-[340px] flex-col overflow-hidden rounded-xl bg-surface-dark shadow-2xl ring-1 ring-white/10"
    >
      {content}
    </div>
  )
}

function GifPickerContent({
  onSelect,
  onClose,
  searchPlaceholder
}: {
  onSelect: (url: string) => void
  onClose: () => void
  searchPlaceholder: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GifResult[]>([])
  const [nextPos, setNextPos] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const scrollRef = useRef<HTMLDivElement>(null)

  const fetchGifs = useCallback(async (q: string, pos?: string) => {
    setLoading(true)
    setError(false)
    try {
      const data = q.trim() ? await api.searchGifs(q.trim(), 20, pos) : await api.getTrendingGifs(20, pos)
      if (pos) {
        setResults((prev) => [...prev, ...data.results])
      } else {
        setResults(data.results)
      }
      setNextPos(data.next)
    } catch {
      if (!pos) setResults([])
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  const mountedRef = useRef(false)

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      fetchGifs('')
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setResults([])
      setNextPos('')
      fetchGifs(query)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, fetchGifs])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || loading || !nextPos) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      fetchGifs(query, nextPos)
    }
  }, [loading, nextPos, query, fetchGifs])

  const left: GifResult[] = []
  const right: GifResult[] = []
  let leftH = 0
  let rightH = 0
  for (const gif of results) {
    const ratio = gif.width > 0 ? gif.height / gif.width : 1
    if (leftH <= rightH) {
      left.push(gif)
      leftH += ratio
    } else {
      right.push(gif)
      rightH += ratio
    }
  }

  return (
    <>
      <div className="shrink-0 border-b border-white/10 px-3 py-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-md bg-surface-darkest px-3 py-1.5 text-sm text-white outline-none placeholder:text-gray-500 focus:ring-1 focus:ring-primary/50"
          autoFocus
        />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2" onScroll={handleScroll}>
        {results.length === 0 && !loading && (
          <div className="py-8 text-center text-sm text-gray-500">
            {error ? (
              <>
                <p>Failed to load GIFs</p>
                <button
                  type="button"
                  className="mt-2 text-xs text-primary hover:underline"
                  onClick={() => fetchGifs(query)}
                >
                  Try again
                </button>
              </>
            ) : query ? (
              'No GIFs found'
            ) : null}
          </div>
        )}

        <div className="flex gap-1.5">
          <div className="flex flex-1 flex-col gap-1.5">
            {left.map((gif) => (
              <GifThumb key={gif.id} gif={gif} onSelect={onSelect} onClose={onClose} />
            ))}
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            {right.map((gif) => (
              <GifThumb key={gif.id} gif={gif} onSelect={onSelect} onClose={onClose} />
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-500 border-t-white" />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-white/10 px-3 py-1.5">
        <p className="text-center text-[10px] text-gray-500">Powered by GIPHY</p>
      </div>
    </>
  )
}

function GifThumb({
  gif,
  onSelect,
  onClose
}: {
  gif: GifResult
  onSelect: (url: string) => void
  onClose: () => void
}) {
  return (
    <button
      type="button"
      className="block w-full overflow-hidden rounded-md transition hover:ring-2 hover:ring-primary"
      onClick={() => {
        onSelect(gif.url)
        onClose()
      }}
      title={gif.title}
    >
      <img
        src={gif.preview}
        alt={gif.title}
        className="w-full rounded-md object-cover"
        loading="lazy"
        style={{
          aspectRatio: gif.width > 0 && gif.height > 0 ? `${gif.width}/${gif.height}` : undefined
        }}
      />
    </button>
  )
}

function XIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M6 18 18 6M6 6l12 12" />
    </svg>
  )
}
