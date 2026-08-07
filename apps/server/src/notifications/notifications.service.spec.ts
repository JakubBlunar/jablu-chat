import { Test, TestingModule } from '@nestjs/testing'
import { InAppNotificationKind } from '../prisma-client'
import { InAppNotificationsService } from '../in-app-notifications/in-app-notifications.service'
import { PushService } from '../push/push.service'
import { NotificationsService } from './notifications.service'

describe('NotificationsService', () => {
  let service: NotificationsService
  let inApp: { record: jest.Mock }
  let push: { sendToUsers: jest.Mock }

  beforeEach(async () => {
    inApp = { record: jest.fn().mockResolvedValue(undefined) }
    push = { sendToUsers: jest.fn().mockResolvedValue(undefined) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: InAppNotificationsService, useValue: inApp },
        { provide: PushService, useValue: push }
      ]
    }).compile()

    service = module.get(NotificationsService)
    service.setEngagementCheck(() => false)
  })

  const base = {
    userIds: ['u1'],
    kind: InAppNotificationKind.moderation,
    payload: { serverId: 's1' },
    title: 'Server',
    body: 'You were timed out'
  }

  it('records the in-app row before attempting push', async () => {
    const order: string[] = []
    inApp.record.mockImplementation(async () => void order.push('record'))
    push.sendToUsers.mockImplementation(async () => void order.push('push'))

    await service.dispatch({ ...base, push: true })

    expect(order).toEqual(['record', 'push'])
  })

  it('still pushes when the in-app write fails', async () => {
    inApp.record.mockRejectedValue(new Error('db down'))

    await service.dispatch({ ...base, push: true })

    expect(push.sendToUsers).toHaveBeenCalled()
  })

  it('does not push to users who are actively engaged', async () => {
    service.setEngagementCheck((id) => id === 'u1')

    await service.dispatch({ ...base, userIds: ['u1', 'u2'], push: true })

    expect(inApp.record).toHaveBeenCalledWith(['u1', 'u2'], expect.anything())
    expect(push.sendToUsers).toHaveBeenCalledWith(['u2'], expect.anything())
  })

  it('skips push entirely when every recipient is engaged', async () => {
    service.setEngagementCheck(() => true)

    await service.dispatch({ ...base, push: true })

    expect(inApp.record).toHaveBeenCalled()
    expect(push.sendToUsers).not.toHaveBeenCalled()
  })

  it('records without pushing when push is not requested', async () => {
    await service.dispatch(base)

    expect(inApp.record).toHaveBeenCalled()
    expect(push.sendToUsers).not.toHaveBeenCalled()
  })

  it('never pushes a row that has no title to show', async () => {
    await service.dispatch({ ...base, title: undefined, push: true })

    expect(push.sendToUsers).not.toHaveBeenCalled()
  })

  it('deduplicates recipients and ignores empty lists', async () => {
    await service.dispatch({ ...base, userIds: ['u1', 'u1'] })
    expect(inApp.record).toHaveBeenCalledWith(['u1'], expect.anything())

    inApp.record.mockClear()
    await service.dispatch({ ...base, userIds: [] })
    expect(inApp.record).not.toHaveBeenCalled()
  })

  it('does not reject when push fails', async () => {
    push.sendToUsers.mockRejectedValue(new Error('vapid broken'))

    await expect(service.dispatch({ ...base, push: true })).resolves.toBeUndefined()
  })

  it('treats everyone as away until the gateway installs the engagement check', async () => {
    const fresh = new NotificationsService(inApp as never, push as never)

    await fresh.dispatch({ ...base, push: true })

    expect(push.sendToUsers).toHaveBeenCalledWith(['u1'], expect.anything())
  })
})
