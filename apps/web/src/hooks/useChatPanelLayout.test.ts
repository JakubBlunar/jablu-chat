import { act, renderHook } from '@testing-library/react'
import { useChatPanelLayout } from './useChatPanelLayout'

it('keeps 480px for messages before docking members or a 320px secondary panel', () => {
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
  for (const available of [479, 696, 719, 720, 768, 799, 800, 952]) {
    act(() => {
      width = available
      resize()
    })
    expect(result.current.overlay).toBe(available - 320 < 480)
    expect(result.current.membersOverlay).toBe(available - 240 < 480)
  }
  unmount()
  globalThis.ResizeObserver = original
})
