import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { useIsMobile } from '@/hooks/useMobile'

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

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

  if (isMobile) {
    return createPortal(
      <ModalOverlay onClose={onClose} zIndex="z-[110]" noPadding className="flex max-h-[80vh] flex-col items-center overflow-hidden">
        <div ref={ref} className="flex w-full flex-col items-center">
          <div className="flex w-full items-center justify-between border-b border-white/10 px-4 py-2">
            <span className="text-sm font-semibold text-white">Emoji</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
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
      </ModalOverlay>,
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
