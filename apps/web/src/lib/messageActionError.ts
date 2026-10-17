import i18n from 'i18next'

export class MessageActionError extends Error {
  readonly reason: 'offline' | 'unconfirmed' | 'rejected'

  constructor(reason: 'offline' | 'unconfirmed' | 'rejected', detail?: string) {
    super(detail ?? reason)
    this.reason = reason
  }
}

export function messageActionError(error: unknown): string {
  if (error instanceof MessageActionError) {
    if (error.reason === 'rejected' && error.message !== 'rejected') return error.message
    return i18n.t(`chat:messageAction_${error.reason}`)
  }
  return i18n.t('chat:messageActionFailed')
}
