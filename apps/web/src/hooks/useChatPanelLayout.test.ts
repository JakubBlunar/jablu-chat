import { act, renderHook } from '@testing-library/react'
import { useChatPanelLayout } from './useChatPanelLayout'

it('keeps 480px for messages and shrinks panels to their minimum before overlaying', () => {
  let width = 1000
  let resize = () => {}
  const original = globalThis.ResizeObserver
  globalThis.ResizeObserver = class implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      resize = () => callback([], this)
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const container = document.createElement('section')
  jest.spyOn(container, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, width, 600))
  const { result, unmount } = renderHook(useChatPanelLayout)
  act(() => result.current.ref(container))
  for (const available of [479, 679, 680, 696, 759, 760, 768, 799, 800, 952]) {
    act(() => {
      width = available
      resize()
    })
    expect(result.current.overlay).toBe(available - 280 < 480)
    expect(result.current.membersOverlay).toBe(available - 200 < 480)
    if (!result.current.overlay)
      expect(available - Math.min(600, result.current.maxPanelWidth)).toBeGreaterThanOrEqual(480)
    if (!result.current.membersOverlay)
      expect(available - Math.min(360, result.current.maxMemberWidth)).toBeGreaterThanOrEqual(480)
  }
  unmount()
  globalThis.ResizeObserver = original
})
