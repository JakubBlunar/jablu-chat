import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useIsMobile } from '@/hooks/useMobile'

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  if (isMobile) {
    return createPortal(
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60" onClick={onClose}>
        <div
          ref={ref}
          className="relative max-h-[80vh] w-[90vw] max-w-sm overflow-hidden rounded-xl bg-surface-dark shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
            <span className="text-sm font-semibold text-white">Emoji</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-gray-400 hover:bg-white/10 hover:text-white"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <Picker
            data={data}
            onEmojiSelect={(emoji: { native?: string }) => {
              if (emoji.native) onSelect(emoji.native)
            }}
            theme="dark"
            previewPosition="none"
            skinTonePosition="search"
            set="native"
          />
        </div>
      </div>,
      document.body
    )
  }

  return (
    <div ref={ref} className="z-50">
      <Picker
        data={data}
        onEmojiSelect={(emoji: { native?: string }) => {
          if (emoji.native) onSelect(emoji.native)
        }}
        theme="dark"
        previewPosition="none"
        skinTonePosition="search"
        set="native"
      />
    </div>
  )
}
