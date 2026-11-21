import { act, renderHook } from '@testing-library/react'
import { useNavigationStore } from '@/stores/navigation.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useSeenMessageAlert } from './useSeenMessageAlert'

jest.mock('@/lib/socket', () => ({ getSocket: () => null }))
jest.mock('@/lib/appVisibility', () => ({
  isAppFocused: () => true,
  subscribeAppVisibility: () => () => {}
}))

it('acknowledges only the visible deep-link target and leaves the timeline cursor alone', async () => {
  jest.useFakeTimers()
  const navigation = useNavigationStore.getState()
  const readState = useReadStateStore.getState()
  const ackChannel = jest.fn().mockResolvedValue(true)
  const hitTest = Object.getOwnPropertyDescriptor(document, 'elementFromPoint')
  const viewport = document.createElement('div')
  const message = document.createElement('div')
  message.id = 'msg-mentioned-reply'
  message.dataset.messageWindow = ''
  message.dataset.messageMounted = 'true'
  viewport.append(message)
  document.body.append(viewport)
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 40))
  const elementFromPoint = jest.fn().mockReturnValue(document.body)
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: elementFromPoint })
  useReadStateStore.setState({ ackChannel })
  useNavigationStore.setState({
    activeNavId: 1,
    request: {
      target: { kind: 'channel', serverId: 's1', channelId: 'ch1' },
      position: { kind: 'message', messageId: 'mentioned-reply', threadParentId: 'parent' },
      source: 'notification'
    }
  })
  const viewportRef = { current: viewport }
  const { rerender, unmount } = renderHook(({ threadParentId }) =>
    useSeenMessageAlert('channel', 'ch1', threadParentId, viewportRef, true),
    { initialProps: { threadParentId: 'wrong-thread' } }
  )
  const flush = () => act(async () => { await jest.advanceTimersByTimeAsync(350) })
  try {
    elementFromPoint.mockReturnValue(message)
    await flush()
    expect(ackChannel).not.toHaveBeenCalled()

    elementFromPoint.mockReturnValue(document.body)
    rerender({ threadParentId: 'parent' })
    await flush()
    expect(ackChannel).not.toHaveBeenCalled()

    elementFromPoint.mockReturnValue(message)
    viewport.dispatchEvent(new Event('scroll'))
    await flush()
    expect(ackChannel).toHaveBeenCalledWith('ch1', {
      throughMessageId: 'mentioned-reply', threadParentId: 'parent', seenOnly: true
    })
    viewport.dispatchEvent(new Event('scroll'))
    await flush()
    expect(ackChannel).toHaveBeenCalledTimes(1)
  } finally {
    unmount()
    viewport.remove()
    useReadStateStore.setState({ ackChannel: readState.ackChannel })
    useNavigationStore.setState(navigation)
    if (hitTest) Object.defineProperty(document, 'elementFromPoint', hitTest)
    else Reflect.deleteProperty(document, 'elementFromPoint')
    jest.restoreAllMocks()
    jest.useRealTimers()
  }
})
