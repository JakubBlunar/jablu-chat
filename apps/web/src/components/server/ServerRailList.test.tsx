import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ServerRailList } from './ServerRailList'
import { useServerLayoutStore } from '@/stores/serverLayout.store'
import { api } from '@/lib/api'
import { makeServer } from '@/test/factories'
import { useReadStateStore } from '@/stores/readState.store'

jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))
jest.mock('@/lib/api', () => ({
  api: { baseUrl: '', get: jest.fn(), put: jest.fn() },
  resolveMediaUrl: (url: string) => url
}))
jest.mock('@/stores/auth.store', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand')
  return { useAuthStore: create(() => ({ user: { id: 'me' } })) }
})

const a = '00000000-0000-4000-8000-000000000001'
const b = '00000000-0000-4000-8000-000000000002'
const folderId = '00000000-0000-4000-8000-000000000003'
const servers = [
  { ...makeServer(a, { name: 'Alpha' }), memberCount: 2 },
  { ...makeServer(b, { name: 'Beta' }), memberCount: 2 }
]
const props = {
  servers,
  currentServerId: null,
  viewMode: 'server' as const,
  navigatingToServerId: null,
  serverBadges: new Map(),
  onServerClick: jest.fn()
}

beforeEach(() => {
  jest.clearAllMocks()
  useServerLayoutStore.getState().reset()
  useServerLayoutStore.setState({
    ownerKey: ':me',
    status: 'ready',
    entries: [
      { type: 'server', serverId: a },
      {
        type: 'folder',
        id: folderId,
        name: 'Games',
        collapsed: true,
        serverIds: [b]
      }
    ]
  })
  jest.mocked(api.put).mockImplementation(async (_path, body) => (body as { entries: unknown }).entries)
})
afterEach(() => jest.restoreAllMocks())

it('portals the organization dialog outside clipping and stacking ancestors', async () => {
  const { container } = render(
    <div style={{ overflow: 'hidden', transform: 'translateX(0)' }}>
      <ServerRailList {...props} />
    </div>
  )
  const organize = screen.getByRole('button', { name: 'organizeServers' })
  organize.focus()
  fireEvent.click(organize)
  const dialog = screen.getByRole('dialog', { name: 'organizeServers' })
  const overlay = dialog.parentElement
  expect(overlay?.parentElement).toBe(document.body)
  expect(container).not.toContainElement(dialog)
  expect(overlay).toHaveClass('fixed', 'inset-0', 'z-[120]', 'bg-black/80')
  if (!overlay) throw new Error('Missing modal overlay')
  fireEvent.click(overlay)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(organize).toHaveFocus())
})

it('shows only a subtle separator instead of the drop target when idle', () => {
  render(<ServerRailList {...props} />)
  expect(screen.queryByLabelText('layoutRootDrop')).not.toBeInTheDocument()
  expect(screen.queryByTitle('layoutRootDrop')).not.toBeInTheDocument()
  const separator = screen.getByRole('separator', { hidden: true })
  expect(separator).toHaveClass('h-0.5', 'w-8', 'bg-white/15')
  expect(separator).not.toHaveClass('border', 'border-dashed')
  expect(separator).toBeEmptyDOMElement()
})

it('opens actions for an inactive server without navigating and marks that server as read', () => {
  const ack = jest.spyOn(useReadStateStore.getState(), 'ackServer').mockResolvedValue(true)
  render(<ServerRailList {...props} currentServerId={b} />)
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Alpha' }))
  expect(screen.getByRole('menu', { name: 'Alpha' })).toBeInTheDocument()
  expect(props.onServerClick).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('menuitem', { name: 'sidebar.markAllAsRead' }))
  expect(ack).toHaveBeenCalledWith(a)
})

it('moves an inactive server directly into an existing folder', async () => {
  render(<ServerRailList {...props} currentServerId={b} />)
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Alpha' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'contextMoveToFolder' }))
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Games' }))
  await waitFor(() => expect(useServerLayoutStore.getState().isSaving).toBe(false))
  expect(useServerLayoutStore.getState().entries).toEqual([
    { type: 'folder', id: folderId, name: 'Games', collapsed: true, serverIds: [b, a] }
  ])
  expect(props.onServerClick).not.toHaveBeenCalled()
})

it('shows collapsed folder unread badges, expands it and navigates normally', async () => {
  render(<ServerRailList {...props} serverBadges={new Map([[b, { unread: true, mentions: 4 }]])} />)
  expect(screen.queryByRole('button', { name: 'Beta' })).not.toBeInTheDocument()
  expect(screen.getByText('4')).toBeInTheDocument()
  const expand = screen.getByRole('button', { name: /layoutExpand/ })
  expect(expand).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(expand)
  await screen.findByRole('button', { name: 'Beta' })
  await waitFor(() => expect(useServerLayoutStore.getState().isSaving).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Beta' }))
  expect(props.onServerClick).toHaveBeenCalledWith(servers[1])
  expect(api.put).toHaveBeenCalledWith('/api/users/@me/server-layout', {
    entries: [
      { type: 'server', serverId: a },
      {
        type: 'folder',
        id: folderId,
        name: 'Games',
        collapsed: false,
        serverIds: [b]
      }
    ]
  })
})

it('can organize folders and ordering without dragging, including while saving', async () => {
  render(<ServerRailList {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'organizeServers' }))
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getAllByRole('combobox', { name: 'layoutMoveTo' })[0], {
    target: { value: folderId }
  })
  let finish!: (value: unknown) => void
  jest.mocked(api.put).mockImplementationOnce(
    (_path, body) =>
      new Promise((resolve) => {
        finish = () => resolve((body as { entries: unknown }).entries)
      })
  )
  fireEvent.click(within(dialog).getByRole('button', { name: 'profileSave' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'profileSave' })).toBeDisabled()
  await act(async () => finish(undefined))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(useServerLayoutStore.getState().entries).toEqual([
    {
      type: 'folder',
      id: folderId,
      name: 'Games',
      collapsed: true,
      serverIds: [b, a]
    }
  ])
})

it('removes a folder without leaving any server behind', async () => {
  render(<ServerRailList {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'organizeServers' }))
  fireEvent.click(screen.getByRole('button', { name: 'layoutDeleteFolder' }))
  fireEvent.click(screen.getByRole('button', { name: 'profileSave' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(useServerLayoutStore.getState().entries).toEqual([
    { type: 'server', serverId: a },
    { type: 'server', serverId: b }
  ])
})

it('creates and renames folders before saving', async () => {
  render(<ServerRailList {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'organizeServers' }))
  fireEvent.change(screen.getAllByRole('textbox', { name: 'layoutFolderName' })[0], {
    target: { value: 'New folder' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'layoutCreateFolder' }))
  fireEvent.change(screen.getByDisplayValue('New folder'), { target: { value: 'Friends' } })
  fireEvent.click(screen.getByRole('button', { name: 'profileSave' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(useServerLayoutStore.getState().entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'folder', name: 'Friends', collapsed: false, serverIds: [] })
    ])
  )
})

it('drags a server below another server and saves the new order', async () => {
  useServerLayoutStore.setState({
    entries: [
      { type: 'server', serverId: a },
      { type: 'server', serverId: b }
    ]
  })
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const title = this.querySelector('button')?.title ?? this.title
    return new DOMRect(12, title === 'Alpha' ? 0 : title === 'Beta' ? 70 : 160, 48, 48)
  })
  render(<ServerRailList {...props} />)
  fireEvent.mouseDown(screen.getByRole('button', { name: 'Alpha' }), { button: 0, clientX: 36, clientY: 24 })
  fireEvent.mouseMove(document, { clientX: 36, clientY: 36 })
  await waitFor(() => expect(screen.getAllByText('A')).toHaveLength(2))
  expect(screen.getByLabelText('layoutRootDrop')).toHaveClass('border-dashed', 'min-h-10')
  fireEvent.mouseMove(document, { clientX: 36, clientY: 100 })
  fireEvent.mouseUp(document, { clientX: 36, clientY: 100 })
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith('/api/users/@me/server-layout', {
      entries: [
        { type: 'server', serverId: b },
        { type: 'server', serverId: a }
      ]
    })
  )
  expect(screen.queryByLabelText('layoutRootDrop')).not.toBeInTheDocument()
  // dnd-kit retains its click-suppression listener for 50 ms after dropping.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60))
  })
})

it('retains the organization dialog and draft after a failed save', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.mocked(api.put).mockRejectedValue(new Error('offline'))
  render(<ServerRailList {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'organizeServers' }))
  fireEvent.click(screen.getByRole('button', { name: 'layoutDeleteFolder' }))
  fireEvent.click(screen.getByRole('button', { name: 'profileSave' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'layoutDeleteFolder' })).not.toBeInTheDocument()
  expect(useServerLayoutStore.getState().entries).toHaveLength(2)
})
