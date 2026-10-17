import { useSettingsStore } from './settings.store'

it('keeps full previews as the default', () => {
  expect(useSettingsStore.getState().compactPreviews).toBe(false)
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
