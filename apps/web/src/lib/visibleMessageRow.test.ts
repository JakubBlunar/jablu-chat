import { firstReadingRow, visibleMessageRow } from './visibleMessageRow'

it('finds partially visible windows and skips rows ending exactly on the boundary', () => {
  const root = document.createElement('div')
  for (let i = 0; i < 600; i++) {
    const row = document.createElement('div')
    row.getBoundingClientRect = jest.fn(() => ({ top: i * 40, bottom: (i + 1) * 40 }) as DOMRect)
    root.append(row)
  }
  const rows = root.querySelectorAll('div')
  const viewport = { top: 120, bottom: 239 } as DOMRect
  expect(visibleMessageRow(rows, viewport, 'first')).toBe(rows[3])
  expect(visibleMessageRow(rows, viewport, 'last')).toBe(rows[5])
  expect(visibleMessageRow(rows, { top: -80, bottom: -40 } as DOMRect, 'first')).toBeUndefined()
})

it('uses the eight-pixel reading line and bounds geometry reads when the log is covered', () => {
  const log = document.createElement('div')
  let reads = 0
  for (let i = 0; i < 600; i++) {
    const row = document.createElement('div')
    row.dataset.messageWindow = ''
    row.getBoundingClientRect = () => {
      reads++
      return new DOMRect(0, i * 40, 300, 40)
    }
    log.append(row)
  }
  const viewport = new DOMRect(0, 520 * 40 - 8, 300, 400)
  expect(firstReadingRow(log, viewport, 8)).toBe(log.children[520])
  expect(reads).toBeLessThanOrEqual(12)
})
