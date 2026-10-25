import type { ReactNode } from 'react'
import i18n from 'i18next'
import chat from '../i18n/locales/en/chat.json'
import friends from '../i18n/locales/en/friends.json'
import profile from '../i18n/locales/en/profile.json'
import common from '../i18n/locales/en/common.json'

// Non-React notification handlers use the i18next singleton directly.
void i18n.init({
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  resources: { en: { chat, friends, profile, common } },
  initAsync: false,
  interpolation: { escapeValue: false }
})

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() }
  }),
  Trans: ({ children }: { children?: ReactNode }) => children
}))
