import { useId, useLayoutEffect, useState, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'

export function useDialogName(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  children: ReactNode,
  label?: string
) {
  const { t } = useTranslation('common')
  const titleId = useId()
  const [headingId, setHeadingId] = useState<string>()
  useLayoutEffect(() => {
    if (!active) return
    const heading = ref.current?.querySelector<HTMLElement>('h1, h2, h3, [data-dialog-title]')
    if (!heading) {
      setHeadingId(undefined)
      return
    }
    if (!heading.id) heading.id = titleId
    setHeadingId(heading.id)
  }, [active, children, ref, titleId])
  return {
    'aria-labelledby': label ? undefined : headingId,
    'aria-label': label ?? (!headingId ? t('dialog') : undefined)
  }
}
