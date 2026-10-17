import { useEffect, useRef, useState } from 'react'
import { resolveMediaUrl } from '@/lib/api'
import { prepareMediaDownload, saveMediaFile } from '@/lib/mediaDownload'
import { showToast } from '@/stores/toast.store'
import { useTranslation } from 'react-i18next'

export function useMediaDownload(url: string | undefined, filename: string) {
  const { t } = useTranslation('common')
  const tRef = useRef(t)
  tRef.current = t
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [prepared, setPrepared] = useState<{
    key: string
    attempt: number
    file?: File
  } | null>(null)
  const key = JSON.stringify([url, filename])
  const preparing = !!url && (prepared?.key !== key || prepared.attempt !== attempt)

  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    void prepareMediaDownload(resolveMediaUrl(url) ?? url, filename, controller.signal).then(
      (file) => {
        if (!controller.signal.aborted) setPrepared({ key, attempt, file })
      },
      () => {
        if (!controller.signal.aborted) {
          setPrepared({ key, attempt })
          showToast(tRef.current('downloadFailed'), tRef.current('downloadLoadFailed'))
        }
      }
    )
    return () => controller.abort()
  }, [url, filename, key, attempt])

  const download = async () => {
    if (!url || preparing || saving) return false
    if (!prepared?.file) {
      setAttempt((value) => value + 1)
      return false
    }
    setSaving(true)
    try {
      return await saveMediaFile(prepared.file)
    } catch {
      showToast(t('downloadFailed'), t('downloadSaveFailed'))
      return false
    } finally {
      setSaving(false)
    }
  }

  return { preparing, saving, failed: !preparing && !!url && !prepared?.file, download }
}
