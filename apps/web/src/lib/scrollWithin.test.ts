import { scrollWithin } from './scrollWithin'

function setup() {
  const shell = document.createElement('div')
  const viewport = document.createElement('div')
  const target = document.createElement('div')
  shell.append(viewport)
  viewport.append(target)
  shell.scrollTop = 0
  viewport.scrollTop = 200
  viewport.scrollLeft = 15
  Object.defineProperties(viewport, {
    clientHeight: { value: 400 },
    scrollHeight: { value: 2000 },
    clientTop: { value: 2 }
  })
  viewport.getBoundingClientRect = () => ({ top: 100 } as DOMRect)
  target.getBoundingClientRect = () => ({ top: 800, height: 80 } as DOMRect)
  target.scrollIntoView = jest.fn()
  return { shell, viewport, target }
}

it('centers the target by scrolling only its message viewport', () => {
  const { shell, viewport, target } = setup()
  scrollWithin(viewport, target)
  expect(viewport.scrollTop).toBe(738)
  expect(viewport.scrollLeft).toBe(15)
  expect(shell.scrollTop).toBe(0)
  expect(target.scrollIntoView).not.toHaveBeenCalled()
})

it('keeps a pagination anchor at the bottom of its viewport', () => {
  const { viewport, target } = setup()
  scrollWithin(viewport, target, 'end')
  expect(viewport.scrollTop).toBe(578)
})

it.each([-1000, 5000])('clamps a target at %s to the message history bounds', (top) => {
  const { viewport, target } = setup()
  target.getBoundingClientRect = () => ({ top, height: 80 } as DOMRect)
  scrollWithin(viewport, target)
  expect(viewport.scrollTop).toBe(top < 0 ? 0 : 1600)
})

it('ignores targets belonging to another message surface and missing elements', () => {
  const { viewport, target } = setup()
  scrollWithin(viewport, document.createElement('div'))
  scrollWithin(viewport, null)
  scrollWithin(null, target)
  expect(viewport.scrollTop).toBe(200)
})
