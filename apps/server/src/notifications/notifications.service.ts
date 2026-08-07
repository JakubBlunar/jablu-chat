import { Injectable, Logger } from '@nestjs/common'
import { InAppNotificationKind } from '../prisma-client'
import { InAppNotificationsService } from '../in-app-notifications/in-app-notifications.service'
import { PushService } from '../push/push.service'

/**
 * Decides whether a user is already looking at the app, and so does not need a
 * push. Supplied by the gateway, which owns the per-socket presence registry.
 */
export type EngagementCheck = (userId: string) => boolean

export type DispatchInput = {
  /** Recipients. The caller is responsible for excluding the actor. */
  userIds: string[]
  kind: InAppNotificationKind
  /** Stable key that merges repeat notifications into one row. */
  dedupeKey?: string
  /** Stored on the row and used by the bell to render and route the click. */
  payload: Record<string, unknown>
  /** Toast title. Omit to record silently in the bell only. */
  title?: string
  body?: string
  /** In-app path the notification points at. */
  url?: string
  /**
   * Whether this is worth waking a device for. Personally addressed things
   * (mention, reply, DM, moderation) push; ambient ones (role change, level up)
   * stay in the bell.
   */
  push?: boolean
}

/**
 * The single entry point for anything the user should be told about.
 *
 * Producers must not call `PushService` or `InAppNotificationsService` directly.
 * Going through here guarantees the ordering that makes notifications reliable:
 * the durable row is written first, then the live socket bump, then push as a
 * best-effort extra. Anything that fails to reach a device is still sitting
 * unread in the notification center.
 *
 * Message delivery is the one exception, and it is a delegation rather than a
 * bypass: `deliverChannelMessage` / `deliverDmMessage` implement the same
 * ordering with the extra per-channel preference and permission filtering that
 * only they have the context for.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)

  /** Installed by the gateway on init; until then every user counts as away. */
  private isUserActivelyEngaged: EngagementCheck = () => false

  constructor(
    private readonly inApp: InAppNotificationsService,
    private readonly push: PushService
  ) {}

  setEngagementCheck(check: EngagementCheck): void {
    this.isUserActivelyEngaged = check
  }

  async dispatch(input: DispatchInput): Promise<void> {
    const userIds = [...new Set(input.userIds)].filter(Boolean)
    if (userIds.length === 0) return

    // 1. Durable row first, so a transport failure below still leaves a record.
    try {
      await this.inApp.record(userIds, {
        kind: input.kind,
        dedupeKey: input.dedupeKey,
        payload: input.payload
      })
    } catch (err) {
      this.logger.error(`Failed to record ${input.kind} notification`, err)
    }

    // 2. Live delivery to connected sessions is handled by the socket bump that
    //    `record` emits, which every client turns into a badge refresh.

    // 3. Push only to users who are not already looking at the app somewhere.
    if (!input.push || !input.title) return
    const awayIds = userIds.filter((id) => !this.isUserActivelyEngaged(id))
    if (awayIds.length === 0) {
      this.logger.debug(`Push skipped for ${input.kind}: all ${userIds.length} recipients engaged`)
      return
    }

    try {
      await this.push.sendToUsers(awayIds, {
        title: input.title,
        body: input.body ?? '',
        url: input.url
      })
    } catch (err) {
      this.logger.warn(`Failed to push ${input.kind} notification`, err)
    }
  }
}
