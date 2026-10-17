import { useSettingsStore } from './settings.store'

beforeEach(() => {
  useSettingsStore.getState().setCompactPreviews(false)
  useSettingsStore.getState().setFontScale(100)
  localStorage.clear()
})

it('keeps full previews as the default', () => {
  expect(useSettingsStore.getState().compactPreviews).toBe(false)
})

it('applies text scaling immediately and restores it from storage', async () => {
  useSettingsStore.getState().setFontScale(125)
  expect(document.documentElement.style.getPropertyValue('--app-text-scale')).toBe('1.25')
  expect(JSON.parse(localStorage.getItem('jablu-settings')!).state.fontScale).toBe(125)
  useSettingsStore.setState({ fontScale: 100 })
  localStorage.setItem('jablu-settings', JSON.stringify({ state: { fontScale: 150 }, version: 1 }))
  await useSettingsStore.persist.rehydrate()
  expect(useSettingsStore.getState().fontScale).toBe(150)
  expect(document.documentElement.style.getPropertyValue('--app-text-scale')).toBe('1.5')
})

it('rejects invalid scales and clamps persisted panel widths', async () => {
  // @ts-expect-error Invalid external input must not change typography.
  expect(() => useSettingsStore.getState().setFontScale(99)).toThrow(RangeError)
  expect(() => useSettingsStore.getState().setPanelWidth('secondary', NaN)).toThrow()
  localStorage.setItem(
    'jablu-settings',
    JSON.stringify({
      state: { fontScale: '150', panelWidths: { secondary: 900, members: '300', dm: 1 } },
      version: 1
    })
  )
  await useSettingsStore.persist.rehydrate()
  expect(useSettingsStore.getState().fontScale).toBe(100)
  expect(useSettingsStore.getState().panelWidths).toEqual({ secondary: 600, members: 240, dm: 200 })
  useSettingsStore.getState().setPanelWidth('secondary', 440)
  expect(JSON.parse(localStorage.getItem('jablu-settings')!).state.panelWidths.secondary).toBe(440)
})

it('persists the opt-in and rejects malformed preference values on hydration', async () => {
  useSettingsStore.getState().setCompactPreviews(true)
  expect(JSON.parse(localStorage.getItem('jablu-settings')!).state.compactPreviews).toBe(true)
  useSettingsStore.getState().setCompactPreviews(false)
  localStorage.setItem('jablu-settings', JSON.stringify({ state: { compactPreviews: 'true' }, version: 1 }))
  await useSettingsStore.persist.rehydrate()
  expect(useSettingsStore.getState().compactPreviews).toBe(false)
  localStorage.setItem('jablu-settings', JSON.stringify({ state: { compactPreviews: true }, version: 1 }))
  await useSettingsStore.persist.rehydrate()
  expect(useSettingsStore.getState().compactPreviews).toBe(true)
})
