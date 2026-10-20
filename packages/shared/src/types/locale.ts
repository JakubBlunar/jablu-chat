export const APP_LOCALES = ['en', 'cs', 'sk'] as const
export type AppLocale = (typeof APP_LOCALES)[number]
