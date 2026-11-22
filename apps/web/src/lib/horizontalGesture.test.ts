import { horizontalGesture, ownsHorizontalTouch } from './horizontalGesture'

it.each([
  [-67, -230, 'left', false],
  [-61, 8, 'left', true],
  [-24, 0, 'left', false],
  [70, 5, 'right', true],
  [70, 5, 'left', false]
] as const)('classifies release at %s,%s on %s', (x, y, dir, expected) => {
  expect(horizontalGesture(x, y, dir)).toBe(expected)
})
it('respects links and horizontal scrollers', () => {
  const root = document.createElement('div')
  root.innerHTML = '<div style="overflow-x:auto"><span></span></div><a href="/"></a>'
  const scroll = root.firstElementChild!
  Object.defineProperty(scroll, 'scrollWidth', { value: 150 })
  expect(ownsHorizontalTouch(scroll.firstChild, root)).toBe(true)
  expect(ownsHorizontalTouch(root.lastElementChild, root)).toBe(true)
})
