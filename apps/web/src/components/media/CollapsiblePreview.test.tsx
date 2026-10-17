import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { CollapsiblePreview } from './CollapsiblePreview'

let mockCompact = false
jest.mock('@/stores/settings.store', () => ({
  useSettingsStore: (select: (state: { compactPreviews: boolean }) => unknown) =>
    select({ compactPreviews: mockCompact })
}))

beforeEach(() => {
  mockCompact = false
})

it('keeps full previews as the unchanged default', () => {
  render(
    <CollapsiblePreview title="Photo">
      <img alt="Photo" src="photo.png" />
    </CollapsiblePreview>
  )
  expect(screen.getByRole('img', { name: 'Photo' })).toBeVisible()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

it('does not mount media until expanded and preserves gallery actions', () => {
  mockCompact = true
  const open = jest.fn()
  render(
    <CollapsiblePreview title="Photo">
      <button onClick={open}>Open gallery</button>
      <img alt="Photo" src="photo.png" />
    </CollapsiblePreview>
  )
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  const toggle = screen.getByRole('button', { name: 'expandPreview' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(toggle)
  expect(screen.getByRole('img')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Open gallery' }))
  expect(open).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'collapsePreview' }))
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})
