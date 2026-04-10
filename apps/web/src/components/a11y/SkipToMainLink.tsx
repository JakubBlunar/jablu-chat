import { useTranslation } from 'react-i18next'

export function SkipToMainLink() {
  const { t } = useTranslation('a11y')
  return (
    <a href="#main-content" className="skip-to-main">
      {t('skipToContent')}
    </a>
  )
}
