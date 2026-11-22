import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { GifPicker } from './GifPicker'
import { api } from '@/lib/api'

jest.mock('@/lib/api', () => ({ api: { getTrendingGifs: jest.fn(), searchGifs: jest.fn() } }))
jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))
const page = (title: string, next = '') => ({
  results: [{ id: title, title, url: '/local', preview: '/local', width: 20, height: 20 }],
  next
})

it('preserves the active query, cursor and tiles across stale responses and a failed next page', async () => {
  jest.useFakeTimers()
  try {
    let cats!: (value: ReturnType<typeof page>) => void
    jest.mocked(api.getTrendingGifs).mockResolvedValue(page('trending'))
    const search = jest.mocked(api.searchGifs)
    search
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            cats = resolve
          })
      )
      .mockResolvedValueOnce(page('otters', 'next'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page('more'))
    render(<GifPicker onClose={jest.fn()} onSelect={jest.fn()} />)
    const input = screen.getByRole('textbox')
    for (const value of ['cats', 'otters']) {
      fireEvent.change(input, { target: { value } })
      await act(async () => {
        await jest.advanceTimersByTimeAsync(300)
      })
    }
    await act(async () => cats(page('cats', 'wrong')))
    const tile = screen.getByTitle('otters')
    expect(screen.queryByTitle('cats')).toBeNull()
    await act(async () => fireEvent.scroll(tile.closest('.overflow-y-auto')!))
    expect(tile).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'gifTryAgain' })))
    expect(search).toHaveBeenLastCalledWith('otters', 20, 'next')
    expect(screen.getByTitle('more')).toBeVisible()
  } finally {
    jest.useRealTimers()
  }
})
