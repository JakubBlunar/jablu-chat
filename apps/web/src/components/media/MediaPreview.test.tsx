import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MediaPreview } from './MediaPreview'

it('reserves preview space and recovers a broken image without nested buttons', () => {
  const open = jest.fn()
  const parentClick = jest.fn()
  const { container } = render(
    <div onClick={parentClick}>
      <MediaPreview src="/photo.png" alt="Photo" onOpen={open} style={{ width: 448, aspectRatio: '3 / 2' }} />
    </div>
  )
  expect(container.querySelector('[aria-busy]')).toHaveStyle({ aspectRatio: '3 / 2' })
  const image = screen.getByAltText('Photo')
  fireEvent.error(image)
  expect(screen.getByRole('alert')).toHaveTextContent('previewFailed')
  expect(screen.getByRole('link', { name: 'openOriginal' })).toHaveAttribute('href', '/photo.png')
  fireEvent.click(screen.getByRole('button', { name: 'retryPreview' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  const retry = screen.getByAltText('Photo')
  expect(retry).not.toBe(image)
  fireEvent.load(retry)
  fireEvent.click(screen.getByRole('button', { name: 'Photo' }))
  expect(open).toHaveBeenCalledTimes(1)
  expect(parentClick).not.toHaveBeenCalled()
  expect(container.querySelector('button button')).toBeNull()
})

it('resets the preview when the resource changes', () => {
  const { rerender, container } = render(<MediaPreview src="/one.png" alt="Photo" onOpen={jest.fn()} compact />)
  fireEvent.error(screen.getByAltText('Photo'))
  rerender(<MediaPreview src="/two.png" alt="Photo" onOpen={jest.fn()} compact />)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(container.querySelector('[aria-busy]')).toHaveAttribute('aria-busy', 'true')
})

it('retains native video controls and exposes a touch-sized expand action and retry', () => {
  const { container } = render(<MediaPreview src="/clip.mp4" alt="Clip" video controls onOpen={jest.fn()} />)
  expect(container.querySelector('video')).toHaveAttribute('controls')
  expect(screen.getByRole('button', { name: 'expand' })).toHaveClass('h-11', 'w-11')
  fireEvent.error(container.querySelector('video')!)
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'retryPreview' })).toBeInTheDocument()
})
