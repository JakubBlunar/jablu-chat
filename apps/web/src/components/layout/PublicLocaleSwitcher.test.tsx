import { fireEvent, render, screen } from '@testing-library/react'
import { useSettingsStore } from '@/stores/settings.store'
import { PublicLocaleSwitcher } from './PublicLocaleSwitcher'

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.getState().setLocale('en')
})

it('lets unauthenticated visitors switch and persist the public-page language', () => {
  render(<PublicLocaleSwitcher />)

  const localeSelect = screen.getByRole('combobox', { name: 'language' }) as HTMLSelectElement
  expect(localeSelect.value).toBe('en')
  expect(screen.getByRole('option', { name: 'Čeština' })).toBeTruthy()
  expect(screen.getByRole('option', { name: 'Slovenčina' })).toBeTruthy()

  fireEvent.change(localeSelect, { target: { value: 'cs' } })

  expect(useSettingsStore.getState().locale).toBe('cs')
  expect(JSON.parse(localStorage.getItem('jablu-settings')!).state.locale).toBe('cs')
})
