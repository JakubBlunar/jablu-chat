import type { ReactNode } from 'react'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() }
  }),
  Trans: ({ children }: { children?: ReactNode }) => children
}))
