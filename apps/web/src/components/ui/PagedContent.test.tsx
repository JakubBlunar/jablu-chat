import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PagedContent } from './PagedContent'

type Page = { items: string[]; total: number }
const show = (items: string[]) => <div>{items.join(', ')}</div>

it('offers retry after a failed load', async () => {
  const load = jest
    .fn<Promise<Page>, [number, number]>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ items: ['Loaded'], total: 1 })
  render(
    <PagedContent loadPage={load} emptyLabel="Empty">
      {show}
    </PagedContent>
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('conversationLoadFailed')
  fireEvent.click(screen.getByRole('button', { name: 'conversationRetry' }))
  expect(await screen.findByText('Loaded')).toBeInTheDocument()
})

it('ignores stale responses when the source changes', async () => {
  let finish!: (result: Page) => void
  const oldLoad = jest.fn(
    () =>
      new Promise<Page>((resolve) => {
        finish = resolve
      })
  )
  const newLoad = jest.fn().mockResolvedValue({ items: ['Current'], total: 1 })
  const { rerender } = render(
    <PagedContent loadPage={oldLoad} emptyLabel="Empty">
      {show}
    </PagedContent>
  )
  rerender(
    <PagedContent loadPage={newLoad} emptyLabel="Empty">
      {show}
    </PagedContent>
  )
  await screen.findByText('Current')
  await act(async () => {
    finish({ items: ['Stale'], total: 1 })
  })
  expect(screen.queryByText('Stale')).not.toBeInTheDocument()
})

it('returns to the last existing page when messages are deleted', async () => {
  const load = jest
    .fn<Promise<Page>, [number, number]>()
    .mockResolvedValueOnce({ items: ['First page'], total: 31 })
    .mockResolvedValueOnce({ items: [], total: 1 })
    .mockResolvedValueOnce({ items: ['Only remaining'], total: 1 })
  render(
    <PagedContent loadPage={load} emptyLabel="Empty">
      {show}
    </PagedContent>
  )
  await screen.findByText('First page')
  fireEvent.click(screen.getByRole('button', { name: 'next' }))
  await waitFor(() => expect(load).toHaveBeenNthCalledWith(3, 0, 30))
  expect(await screen.findByText('Only remaining')).toBeInTheDocument()
})
